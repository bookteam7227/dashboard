// /js/pages/instructor-sales.js

import {
    getDocumentRow
} from "../services/firestore-service.js";
import {
    calculateChangeRate,
    formatNumber,
    formatSignedValue,
    getNumber
} from "../utils/number-utils.js";
import { createAnnualChart } from "../utils/chart-utils.js";
import {
    getCachedData,
    getDataVersion,
    setCachedData
} from "../services/data-cache.js";

export const title = "강사별 매출";

const CACHE_SCOPE = "instructor_sales";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let active = false;
let cacheVersion = null;
let instructorSalesChart = null;
let instructorAnnualTotalChart = null;

let comparisonRowsState = [];
let comparisonTotalRowHtml = "";
let comparisonSort = {
    key: "currentValue",
    direction: "desc"
};

function destroyChart() {
    instructorSalesChart?.destroy();
    instructorAnnualTotalChart?.destroy();

    instructorSalesChart = null;
    instructorAnnualTotalChart = null;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getCurrentMonthId() {
    const today = new Date();

    return (
        `${today.getFullYear()}-`
        + `${String(today.getMonth() + 1).padStart(2, "0")}`
    );
}

function getPreviousYearMonthId(monthId) {
    const match =
        /^(\d{4})-(\d{2})$/.exec(
            String(monthId || "")
        );

    if (!match) {
        return null;
    }

    return (
        `${Number(match[1]) - 1}-`
        + `${match[2]}`
    );
}


async function getInstructorTrendDocumentId(instructorName) {
    const bytes =
        new TextEncoder().encode(instructorName);

    const digest =
        await crypto.subtle.digest(
            "SHA-1",
            bytes
        );

    return Array.from(
        new Uint8Array(digest)
    )
        .map((value) =>
            value.toString(16).padStart(2, "0")
        )
        .join("")
        .slice(0, 12);
}

function getInstructorSalesMap(rows) {
    const result = new Map();

    rows.forEach((row) => {
        const instructorName =
            String(
                row.instructor_name || ""
            ).trim();

        if (!instructorName) {
            return;
        }

        result.set(
            instructorName,
            getNumber(row.book_sales)
        );
    });

    return result;
}

function getComparisonRateValue(
    currentValue,
    previousValue
) {
    if (previousValue === 0) {
        return currentValue === 0
            ? 0
            : null;
    }

    return (
        (
            currentValue
            - previousValue
        )
        / previousValue
    ) * 100;
}

function updateSortButtonState() {
    document
        .querySelectorAll(
            ".instructor-sort-button"
        )
        .forEach((button) => {
            const sortKey =
                button.dataset.sortKey;

            const isActive =
                sortKey === comparisonSort.key;

            button.classList.toggle(
                "is-active",
                isActive
            );

            button.dataset.direction =
                isActive
                    ? comparisonSort.direction
                    : "";

            button.setAttribute(
                "aria-sort",
                isActive
                    ? (
                        comparisonSort.direction
                        === "asc"
                            ? "ascending"
                            : "descending"
                    )
                    : "none"
            );
        });
}

function compareNullableNumbers(
    a,
    b,
    direction
) {
    const aMissing =
        a === null
        || a === undefined
        || Number.isNaN(a);

    const bMissing =
        b === null
        || b === undefined
        || Number.isNaN(b);

    if (aMissing && bMissing) {
        return 0;
    }

    if (aMissing) {
        return 1;
    }

    if (bMissing) {
        return -1;
    }

    return direction === "asc"
        ? a - b
        : b - a;
}

function renderSortedComparisonRows() {
    const body =
        document.getElementById(
            "instructorSalesTableBody"
        );

    if (!body) {
        return;
    }

    const sortedRows =
        [...comparisonRowsState].sort(
            (a, b) => {
                let result = 0;

                if (
                    comparisonSort.key
                    === "instructorName"
                ) {
                    result =
                        a.instructorName
                            .localeCompare(
                                b.instructorName,
                                "ko-KR"
                            );

                    if (
                        comparisonSort.direction
                        === "desc"
                    ) {
                        result *= -1;
                    }
                } else {
                    result =
                        compareNullableNumbers(
                            a[
                                comparisonSort.key
                            ],
                            b[
                                comparisonSort.key
                            ],
                            comparisonSort.direction
                        );
                }

                if (result !== 0) {
                    return result;
                }

                return a.instructorName
                    .localeCompare(
                        b.instructorName,
                        "ko-KR"
                    );
            }
        );

    body.innerHTML =
        comparisonTotalRowHtml
        + sortedRows.map(
            (row) => {
                const changeClass =
                    row.change > 0
                        ? "is-positive"
                        : row.change < 0
                            ? "is-negative"
                            : "is-neutral";

                const rate =
                    calculateChangeRate(
                        row.currentValue,
                        row.previousValue
                    );

                const rateClass =
                    rate.className
                        === "tooltip-positive"
                            ? "is-positive"
                            : rate.className
                                === "tooltip-negative"
                                ? "is-negative"
                                : "is-neutral";

                return `
                    <tr>
                        <td class="instructor-name-cell">
                            ${escapeHtml(
                                row.instructorName
                            )}
                        </td>
                        <td>
                            ${formatNumber(
                                row.previousValue
                            )}
                        </td>
                        <td>
                            ${formatNumber(
                                row.currentValue
                            )}
                        </td>
                        <td class="${changeClass}">
                            ${formatSignedValue(
                                row.change,
                                ""
                            )}
                        </td>
                        <td class="${rateClass}">
                            ${rate.text}
                        </td>
                    </tr>
                `;
            }
        ).join("");

    updateSortButtonState();
}

function handleComparisonSort(event) {
    const button =
        event.target.closest(
            ".instructor-sort-button"
        );

    if (!button) {
        return;
    }

    const sortKey =
        button.dataset.sortKey;

    if (!sortKey) {
        return;
    }

    if (comparisonSort.key === sortKey) {
        comparisonSort = {
            key: sortKey,
            direction:
                comparisonSort.direction === "asc"
                    ? "desc"
                    : "asc"
        };
    } else {
        comparisonSort = {
            key: sortKey,
            direction: "asc"
        };
    }

    renderSortedComparisonRows();
}

function renderComparisonTable(
    monthId,
    currentRows,
    previousRows
) {
    const match =
        /^(\d{4})-(\d{2})$/.exec(monthId);

    if (!match) {
        return;
    }

    const currentYear =
        Number(match[1]);

    const month =
        Number(match[2]);

    const previousYear =
        currentYear - 1;

    const currentMap =
        getInstructorSalesMap(currentRows);

    const previousMap =
        getInstructorSalesMap(previousRows);

    const instructorNames =
        Array.from(
            new Set([
                ...currentMap.keys(),
                ...previousMap.keys()
            ])
        );

    comparisonRowsState =
        instructorNames.map(
            (instructorName) => {
                const previousValue =
                    previousMap.get(
                        instructorName
                    ) || 0;

                const currentValue =
                    currentMap.get(
                        instructorName
                    ) || 0;

                return {
                    instructorName,
                    previousValue,
                    currentValue,
                    change:
                        currentValue
                        - previousValue,
                    rateValue:
                        getComparisonRateValue(
                            currentValue,
                            previousValue
                        )
                };
            }
        );

    document.getElementById(
        "instructorSalesTitle"
    ).textContent =
        `${month}월 강사별 매출 현황 (전년 동기간 비교)`;

    document.getElementById(
        "instructorPreviousYearHeader"
    ).textContent =
        `전년(${previousYear}년)`;

    document.getElementById(
        "instructorCurrentYearHeader"
    ).textContent =
        `금년(${currentYear}년)`;

    const body =
        document.getElementById(
            "instructorSalesTableBody"
        );

    if (!instructorNames.length) {
        comparisonRowsState = [];
        comparisonTotalRowHtml = "";

        body.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="instructor-sales-empty"
                >
                    선택한 연월의 강사별 매출 데이터가 없습니다.
                </td>
            </tr>
        `;

        updateSortButtonState();
        return;
    }

    const previousTotal =
        Array.from(previousMap.values())
            .reduce(
                (sum, value) =>
                    sum + getNumber(value),
                0
            );

    const currentTotal =
        Array.from(currentMap.values())
            .reduce(
                (sum, value) =>
                    sum + getNumber(value),
                0
            );

    const totalChange =
        currentTotal - previousTotal;

    const totalRate =
        calculateChangeRate(
            currentTotal,
            previousTotal
        );

    const totalChangeClass =
        totalChange > 0
            ? "is-positive"
            : totalChange < 0
                ? "is-negative"
                : "is-neutral";

    const totalRateClass =
        totalRate.className === "tooltip-positive"
            ? "is-positive"
            : totalRate.className === "tooltip-negative"
                ? "is-negative"
                : "is-neutral";

    const totalRow = `
        <tr class="instructor-sales-total-row">
            <td class="instructor-name-cell">
                합계
            </td>
            <td>
                ${formatNumber(previousTotal)}
            </td>
            <td>
                ${formatNumber(currentTotal)}
            </td>
            <td class="${totalChangeClass}">
                ${formatSignedValue(
                    totalChange,
                    ""
                )}
            </td>
            <td class="${totalRateClass}">
                ${totalRate.text}
            </td>
        </tr>
    `;

    comparisonTotalRowHtml =
        totalRow;

    renderSortedComparisonRows();
}

async function loadComparison(monthId) {
    const status =
        document.getElementById(
            "instructorSalesStatus"
        );

    const previousMonthId =
        getPreviousYearMonthId(monthId);

    if (!previousMonthId) {
        status.classList.add("error");
        status.textContent =
            "기준 연월 형식이 올바르지 않습니다.";
        return;
    }

    status.classList.remove("error");
    status.textContent =
        "강사별 매출 자료를 불러오고 있습니다.";

    const loadMonthlySummary = async (targetMonthId) => {
        const cacheKey = `comparison:${targetMonthId}`;
        const cached = getCachedData(
            CACHE_SCOPE,
            cacheKey,
            cacheVersion,
            CACHE_TTL_MS
        );

        if (cached !== null) {
            return cached;
        }

        const row = await getDocumentRow(
            "instructor_sales_monthly_summary",
            targetMonthId
        );

        setCachedData(
            CACHE_SCOPE,
            cacheKey,
            cacheVersion,
            row
        );

        return row;
    };

    const [
        currentSummary,
        previousSummary
    ] = await Promise.all([
        loadMonthlySummary(monthId),
        loadMonthlySummary(previousMonthId)
    ]);

    const currentRows =
        Array.isArray(currentSummary?.instructors)
            ? currentSummary.instructors
            : [];

    const previousRows =
        Array.isArray(previousSummary?.instructors)
            ? previousSummary.instructors
            : [];

    if (!active) {
        return;
    }

    renderComparisonTable(
        monthId,
        currentRows,
        previousRows
    );

    status.textContent =
        `${previousMonthId} / ${monthId} 비교`;
}

function buildYearlyData(
    rows,
    firstYear,
    currentYear
) {
    const yearlyData =
        new Map();

    for (
        let year = currentYear;
        year >= firstYear;
        year -= 1
    ) {
        yearlyData.set(
            year,
            Array(12).fill(null)
        );
    }

    rows.forEach((row) => {
        const year =
            Number(row.base_year);

        const month =
            Number(row.month);

        if (
            !yearlyData.has(year)
            || month < 1
            || month > 12
        ) {
            return;
        }

        yearlyData.get(year)[month - 1] =
            getNumber(row.book_sales);
    });

    return yearlyData;
}


function sumMonthlyValues(
    monthlyValues,
    endMonth = 12
) {
    if (!Array.isArray(monthlyValues)) {
        return 0;
    }

    return monthlyValues
        .slice(0, endMonth)
        .reduce(
            (sum, value) =>
                sum + getNumber(value),
            0
        );
}

function getLastDataMonth(monthlyValues) {
    if (!Array.isArray(monthlyValues)) {
        return 0;
    }

    for (
        let index = monthlyValues.length - 1;
        index >= 0;
        index -= 1
    ) {
        if (monthlyValues[index] !== null) {
            return index + 1;
        }
    }

    return 0;
}

function getYearlyTotals(
    yearlyData,
    currentYear
) {
    return Array.from(yearlyData.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, monthlyValues]) => {
            const lastDataMonth =
                getLastDataMonth(
                    monthlyValues
                );

            const comparisonEndMonth =
                year === currentYear
                    && lastDataMonth > 0
                        ? lastDataMonth
                        : 12;

            const total =
                sumMonthlyValues(
                    monthlyValues,
                    comparisonEndMonth
                );

            const previousMonthlyValues =
                yearlyData.get(year - 1);

            const previousTotal =
                previousMonthlyValues
                    ? sumMonthlyValues(
                        previousMonthlyValues,
                        comparisonEndMonth
                    )
                    : null;

            const change =
                previousTotal === null
                    ? null
                    : total - previousTotal;

            const rate =
                previousTotal === null
                    ? null
                    : calculateChangeRate(
                        total,
                        previousTotal
                    );

            return {
                year,
                total,
                previousTotal,
                change,
                rate,
                lastDataMonth,
                comparisonEndMonth,
                isCurrentYear:
                    year === currentYear
            };
        });
}

function getOrCreateAnnualTotalTooltip(chart) {
    const container =
        chart.canvas.parentNode;

    let element =
        container.querySelector(
            ".chart-tooltip"
        );

    if (!element) {
        element =
            document.createElement("div");

        element.className =
            "chart-tooltip";

        container.appendChild(element);
    }

    return element;
}

function renderAnnualTotalTooltip(
    context,
    yearlyTotals
) {
    const { chart, tooltip } =
        context;

    const element =
        getOrCreateAnnualTotalTooltip(
            chart
        );

    if (
        !tooltip.opacity
        || !tooltip.dataPoints?.length
    ) {
        element.style.opacity = 0;
        return;
    }

    const dataIndex =
        tooltip.dataPoints[0].dataIndex;

    const row =
        yearlyTotals[dataIndex];

    if (!row) {
        element.style.opacity = 0;
        return;
    }

    const changeClass =
        row.change === null
            ? "tooltip-neutral"
            : row.change > 0
                ? "tooltip-positive"
                : row.change < 0
                    ? "tooltip-negative"
                    : "tooltip-neutral";

    const rateClass =
        row.rate?.className
        || "tooltip-neutral";

    const previousLabel =
        row.previousTotal === null
            ? "전년 데이터 없음"
            : row.isCurrentYear
                ? `전년 동기간(1~${row.comparisonEndMonth}월)`
                : `전년(${row.year - 1}년)`;

    const previousValue =
        row.previousTotal === null
            ? "-"
            : `${formatNumber(
                row.previousTotal
            )}원`;

    const changeValue =
        row.change === null
            ? "-"
            : formatSignedValue(
                row.change,
                "원"
            );

    const rateValue =
        row.rate?.text || "-";

    const currentPeriodRow =
        row.isCurrentYear
            ? `
                <div class="tooltip-row">
                    <span class="tooltip-label">
                        집계 기준
                    </span>

                    <span class="tooltip-value tooltip-neutral">
                        ${row.lastDataMonth > 0
                            ? `${row.lastDataMonth}월까지`
                            : "데이터 없음"}
                    </span>
                </div>
            `
            : "";

    element.innerHTML = `
        <div class="tooltip-title">
            ${row.year}년 매출 합계
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">
                매출 합계
            </span>

            <span class="tooltip-value">
                ${formatNumber(row.total)}원
            </span>
        </div>

        ${currentPeriodRow}

        <div class="tooltip-row">
            <span class="tooltip-label">
                ${previousLabel}
            </span>

            <span class="tooltip-value tooltip-neutral">
                ${previousValue}
            </span>
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">
                전년대비 증감
            </span>

            <span class="tooltip-value ${changeClass}">
                ${changeValue}
            </span>
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">
                전년대비 증감률
            </span>

            <span class="tooltip-value ${rateClass}">
                ${rateValue}
            </span>
        </div>
    `;

    const canvasBox =
        chart.canvas.getBoundingClientRect();

    const containerBox =
        chart.canvas.parentNode
            .getBoundingClientRect();

    const cursorX =
        canvasBox.left
        - containerBox.left
        + tooltip.caretX;

    const top =
        canvasBox.top
        - containerBox.top
        + tooltip.caretY;

    const halfWidth =
        (element.offsetWidth || 220) / 2;

    const horizontalOffset = 30;

    let left =
        cursorX
        + halfWidth
        + horizontalOffset;

    if (
        left + halfWidth + 8
        > containerBox.width
    ) {
        left =
            cursorX
            - halfWidth
            - horizontalOffset;
    }

    left = Math.max(
        halfWidth + 8,
        Math.min(
            left,
            containerBox.width
            - halfWidth
            - 8
        )
    );

    const halfHeight =
        (element.offsetHeight || 180) / 2;

    const clampedTop =
        Math.max(
            halfHeight + 8,
            Math.min(
                top,
                containerBox.height
                - halfHeight
                - 8
            )
        );

    element.style.opacity = 1;
    element.style.left = `${left}px`;
    element.style.top = `${clampedTop}px`;
}

function createAnnualTotalChart(
    canvas,
    yearlyTotals
) {
    return new Chart(canvas, {
        type: "bar",

        data: {
            labels:
                yearlyTotals.map(
                    (row) => `${row.year}년`
                ),

            datasets: [
                {
                    label: "연간 매출 합계",
                    data:
                        yearlyTotals.map(
                            (row) => row.total
                        ),
                    backgroundColor: "#0f6fe8",
                    borderColor: "#0b62cf",
                    borderWidth: 1,
                    borderRadius: 5,
                    maxBarThickness: 46
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    enabled: false,
                    external: (context) =>
                        renderAnnualTotalTooltip(
                            context,
                            yearlyTotals
                        )
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9,
                            weight: "bold"
                        }
                    }
                },

                y: {
                    beginAtZero: true,

                    grid: {
                        color: "#edf1f5"
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9
                        },
                        callback: (value) =>
                            formatNumber(value)
                    }
                }
            }
        }
    });
}

async function loadTrend(instructorName) {
    const normalizedName =
        String(
            instructorName || ""
        ).trim();

    const status =
        document.getElementById(
            "instructorTrendStatus"
        );

    if (!normalizedName) {
        status.classList.add("error");
        status.textContent =
            "조회할 강사명을 입력해 주십시오.";
        return;
    }

    status.classList.remove("error");
    status.textContent =
        "강사별 매출 추이를 불러오고 있습니다.";

    const currentYear =
        new Date().getFullYear();

    const firstYear =
        currentYear - 4;

    const trendDocumentId =
        await getInstructorTrendDocumentId(
            normalizedName
        );

    const trendCacheKey =
        `trend:${trendDocumentId}`;

    let trendDocument = getCachedData(
        CACHE_SCOPE,
        trendCacheKey,
        cacheVersion,
        CACHE_TTL_MS
    );

    if (trendDocument === null) {
        trendDocument =
            await getDocumentRow(
                "instructor_sales_trend",
                trendDocumentId
            );

        setCachedData(
            CACHE_SCOPE,
            trendCacheKey,
            cacheVersion,
            trendDocument
        );
    }

    const rows =
        Array.isArray(trendDocument?.records)
            ? trendDocument.records.filter(
                (row) =>
                    Number(row.base_year) >= firstYear
                    && Number(row.base_year) <= currentYear
            )
            : [];

    if (!active) {
        return;
    }

    destroyChart();

    if (!rows.length) {
        status.textContent =
            `${normalizedName}: 최근 5개년 매출 데이터가 없습니다.`;

        document.getElementById(
            "instructorAnnualTotalStatus"
        ).textContent =
            "연도별 합계 데이터가 없습니다.";

        return;
    }

    const yearlyData =
        buildYearlyData(
            rows,
            firstYear,
            currentYear
        );

    instructorSalesChart =
        createAnnualChart(
            document.getElementById(
                "instructorSalesTrendChart"
            ),
            yearlyData,
            "원"
        );

    instructorSalesChart.data.datasets
        .forEach((dataset) => {
            const year =
                Number(
                    String(dataset.label)
                        .replace("년", "")
                );

            dataset.hidden =
                year !== currentYear
                && year !== currentYear - 1;
        });

    instructorSalesChart.update();

    instructorAnnualTotalChart =
        createAnnualTotalChart(
            document.getElementById(
                "instructorAnnualTotalChart"
            ),
            getYearlyTotals(
                yearlyData,
                currentYear
            )
        );

    document.getElementById(
        "instructorAnnualTotalStatus"
    ).textContent =
        `${normalizedName} · ${firstYear}~${currentYear} · 연도별 합계`;

    status.textContent =
        `${normalizedName} · ${firstYear}~${currentYear} · 월별 교재매출`;
}

async function searchComparison() {
    const monthId =
        document.getElementById(
            "instructorSalesMonth"
        ).value;

    if (!monthId) {
        return;
    }

    try {
        await loadComparison(monthId);
    } catch (error) {
        console.error(
            "[instructorSalesComparison]",
            error
        );

        if (!active) {
            return;
        }

        const status =
            document.getElementById(
                "instructorSalesStatus"
            );

        status.classList.add("error");
        status.textContent =
            "강사별 매출 비교자료를 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

async function searchTrend() {
    const instructorName =
        document.getElementById(
            "instructorNameSearch"
        ).value;

    try {
        await loadTrend(instructorName);
    } catch (error) {
        console.error(
            "[instructorSalesTrend]",
            error
        );

        if (!active) {
            return;
        }

        const status =
            document.getElementById(
                "instructorTrendStatus"
            );

        status.classList.add("error");

        if (
            String(error?.message || "")
                .toLowerCase()
                .includes("index")
        ) {
            status.textContent =
                "강사별 매출 추이 조회용 Firestore 복합 인덱스가 필요합니다.";
        } else {
            status.textContent =
                "강사별 매출 추이를 불러오지 못했습니다. Firestore 설정과 보안 규칙을 확인해 주십시오.";
        }
    }
}

function createMarkup() {
    return `
        <section class="instructor-sales-grid">
            <article class="dashboard-card instructor-sales-card">
                <div class="dashboard-card-header instructor-analysis-header">
                    <div>
                        <h2 id="instructorSalesTitle">
                            강사별 매출 현황
                        </h2>

                        <p id="instructorSalesStatus">
                            기준 연월을 선택한 뒤 조회해 주십시오.
                        </p>
                    </div>

                    <div class="instructor-filter">
                        <label for="instructorSalesMonth">
                            기준 연월
                        </label>

                        <input
                            id="instructorSalesMonth"
                            type="month"
                            aria-label="강사별 매출 기준 연월"
                        >

                        <button
                            id="instructorSalesSearchButton"
                            class="btn primary"
                            type="button"
                        >
                            조회
                        </button>
                    </div>
                </div>

                <div class="instructor-sales-table-wrap">
                    <table class="instructor-sales-table">
                        <thead>
                            <tr>
                                <th>
                                    <button
                                        class="inventory-risk-sort-button instructor-sort-button"
                                        type="button"
                                        data-sort-key="instructorName"
                                        aria-sort="none"
                                        aria-label="강사명 정렬"
                                    >
                                        <span>강사명</span>
                                        <span
                                            class="inventory-risk-sort-icon"
                                            aria-hidden="true"
                                        ></span>
                                    </button>
                                </th>

                                <th>
                                    <button
                                        class="inventory-risk-sort-button instructor-sort-button"
                                        type="button"
                                        data-sort-key="previousValue"
                                        aria-sort="none"
                                        aria-label="전년 매출 정렬"
                                    >
                                        <span id="instructorPreviousYearHeader">
                                            전년
                                        </span>
                                        <span
                                            class="inventory-risk-sort-icon"
                                            aria-hidden="true"
                                        ></span>
                                    </button>
                                </th>

                                <th>
                                    <button
                                        class="inventory-risk-sort-button instructor-sort-button"
                                        type="button"
                                        data-sort-key="currentValue"
                                        aria-sort="none"
                                        aria-label="금년 매출 정렬"
                                    >
                                        <span id="instructorCurrentYearHeader">
                                            금년
                                        </span>
                                        <span
                                            class="inventory-risk-sort-icon"
                                            aria-hidden="true"
                                        ></span>
                                    </button>
                                </th>

                                <th>
                                    <button
                                        class="inventory-risk-sort-button instructor-sort-button"
                                        type="button"
                                        data-sort-key="change"
                                        aria-sort="none"
                                        aria-label="전년대비 증감 정렬"
                                    >
                                        <span>전년대비 증감</span>
                                        <span
                                            class="inventory-risk-sort-icon"
                                            aria-hidden="true"
                                        ></span>
                                    </button>
                                </th>

                                <th>
                                    <button
                                        class="inventory-risk-sort-button instructor-sort-button"
                                        type="button"
                                        data-sort-key="rateValue"
                                        aria-sort="none"
                                        aria-label="전년대비 증감률 정렬"
                                    >
                                        <span>전년대비 증감률</span>
                                        <span
                                            class="inventory-risk-sort-icon"
                                            aria-hidden="true"
                                        ></span>
                                    </button>
                                </th>
                            </tr>
                        </thead>

                        <tbody id="instructorSalesTableBody">
                            <tr>
                                <td
                                    colspan="5"
                                    class="instructor-sales-empty"
                                >
                                    조회 전에는 강사별 매출 데이터를 불러오지 않습니다.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>

            <div class="instructor-trend-stack">
                <article class="dashboard-card dashboard-chart-card instructor-trend-card">
                    <div class="dashboard-card-header dashboard-chart-header instructor-analysis-header">
                        <div>
                            <h2>강사별 매출 추이</h2>

                            <p id="instructorTrendStatus">
                                강사명을 입력하면 최근 5개년 월별 매출을 표시합니다.
                            </p>
                        </div>

                        <div class="instructor-search">
                            <input
                                id="instructorNameSearch"
                                type="text"
                                placeholder="강사명"
                                aria-label="강사명 검색"
                                autocomplete="off"
                            >

                            <button
                                id="instructorTrendSearchButton"
                                class="btn primary"
                                type="button"
                            >
                                조회
                            </button>
                        </div>
                    </div>

                    <div class="dashboard-chart-box instructor-trend-chart-box">
                        <canvas id="instructorSalesTrendChart"></canvas>
                    </div>
                </article>

                <article class="dashboard-card dashboard-chart-card instructor-annual-total-card">
                    <div class="dashboard-card-header dashboard-chart-header">
                        <div>
                            <h2>강사별 연도 매출 합계</h2>

                            <p id="instructorAnnualTotalStatus">
                                동일한 조회 데이터를 기준으로 연도별 합계를 표시합니다.
                            </p>
                        </div>
                    </div>

                    <div class="dashboard-chart-box instructor-annual-total-chart-box">
                        <canvas id="instructorAnnualTotalChart"></canvas>
                    </div>
                </article>
            </div>
        </section>
    `;
}

export async function mount({
    content,
    actions
}) {
    active = true;
    cacheVersion =
        await getDataVersion(
            CACHE_SCOPE
        );

    actions.innerHTML = "";
    content.innerHTML = createMarkup();

    if (
        typeof Chart === "undefined"
    ) {
        throw new Error(
            "Chart.js를 불러오지 못했습니다."
        );
    }

    const monthInput =
        document.getElementById(
            "instructorSalesMonth"
        );

    monthInput.value =
        getCurrentMonthId();

    document
        .getElementById(
            "instructorSalesSearchButton"
        )
        .addEventListener(
            "click",
            searchComparison
        );

    document
        .querySelector(
            ".instructor-sales-table thead"
        )
        .addEventListener(
            "click",
            handleComparisonSort
        );

    updateSortButtonState();

    document
        .getElementById(
            "instructorTrendSearchButton"
        )
        .addEventListener(
            "click",
            searchTrend
        );

    document
        .getElementById(
            "instructorNameSearch"
        )
        .addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    searchTrend();
                }
            }
        );

}

export function unmount() {
    active = false;
    destroyChart();
}
