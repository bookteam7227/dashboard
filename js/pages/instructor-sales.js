// /js/pages/instructor-sales.js

import {
    getCollectionRowsByDocumentIdPrefix,
    getCollectionRowsByFieldEqualsAndRange
} from "../services/firestore-service.js";
import {
    calculateChangeRate,
    formatNumber,
    formatSignedValue,
    getNumber
} from "../utils/number-utils.js";
import { createAnnualChart } from "../utils/chart-utils.js";

export const title = "강사별 매출";

let active = false;
let instructorSalesChart = null;
let instructorAnnualTotalChart = null;

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
        ).sort(
            (a, b) => {
                const salesDifference =
                    (currentMap.get(b) || 0)
                    - (currentMap.get(a) || 0);

                if (salesDifference !== 0) {
                    return salesDifference;
                }

                return a.localeCompare(
                    b,
                    "ko-KR"
                );
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
        return;
    }

    body.innerHTML =
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

                const change =
                    currentValue - previousValue;

                const rate =
                    calculateChangeRate(
                        currentValue,
                        previousValue
                    );

                const changeClass =
                    change > 0
                        ? "is-positive"
                        : change < 0
                            ? "is-negative"
                            : "is-neutral";

                const rateClass =
                    rate.className === "tooltip-positive"
                        ? "is-positive"
                        : rate.className === "tooltip-negative"
                            ? "is-negative"
                            : "is-neutral";

                return `
                    <tr>
                        <td class="instructor-name-cell">
                            ${escapeHtml(instructorName)}
                        </td>
                        <td>
                            ${formatNumber(previousValue)}원
                        </td>
                        <td>
                            ${formatNumber(currentValue)}원
                        </td>
                        <td class="${changeClass}">
                            ${formatSignedValue(
                                change,
                                "원"
                            )}
                        </td>
                        <td class="${rateClass}">
                            ${rate.text}
                        </td>
                    </tr>
                `;
            }
        ).join("");
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

    const [
        currentRows,
        previousRows
    ] = await Promise.all([
        getCollectionRowsByDocumentIdPrefix(
            "monthly_instructor_sales_payment",
            `${monthId}_`
        ),
        getCollectionRowsByDocumentIdPrefix(
            "monthly_instructor_sales_payment",
            `${previousMonthId}_`
        )
    ]);

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

    element.style.opacity = 1;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
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

    const rows =
        await getCollectionRowsByFieldEqualsAndRange(
            "monthly_instructor_sales_payment",
            "instructor_name",
            normalizedName,
            "base_month",
            `${firstYear}-01`,
            `${currentYear}-12`
        );

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
                                <th>강사명</th>
                                <th id="instructorPreviousYearHeader">
                                    전년
                                </th>
                                <th id="instructorCurrentYearHeader">
                                    금년
                                </th>
                                <th>전년대비 증감</th>
                                <th>전년대비 증감률</th>
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
