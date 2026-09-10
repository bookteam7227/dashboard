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

function destroyChart() {
    instructorSalesChart?.destroy();
    instructorSalesChart = null;
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
            (a, b) =>
                a.localeCompare(
                    b,
                    "ko-KR"
                )
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
        return;
    }

    instructorSalesChart =
        createAnnualChart(
            document.getElementById(
                "instructorSalesTrendChart"
            ),
            buildYearlyData(
                rows,
                firstYear,
                currentYear
            ),
            "원"
        );

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
                            전년 동기간 매출을 비교합니다.
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
                                    강사별 매출 자료를 불러오고 있습니다.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>

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

    try {
        await loadComparison(
            monthInput.value
        );
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

export function unmount() {
    active = false;
    destroyChart();
}
