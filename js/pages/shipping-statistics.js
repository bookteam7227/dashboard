// /js/pages/shipping-statistics.js

import {
    getCollectionRowsByDocumentIdRange
} from "../services/firestore-service.js";
import {
    addDays,
    dateToId,
    formatChartDate,
    formatFullDate,
    getDateRange,
    getMonthBounds,
    getPreviousYearDateId,
    parseDateId
} from "../utils/date-utils.js";
import { getNumber } from "../utils/number-utils.js";
import {
    createAnnualChart,
    createComparisonChart
} from "../utils/chart-utils.js";

export const title = "발송 통계";

const dailyMap = new Map();
const annualYearData = new Map();
const annualVisibleYears = new Set();
const annualLoadingYears = new Set();

let ordersChart = null;
let booksChart = null;
let annualChart = null;
let active = false;

function destroyCharts() {
    [
        ordersChart,
        booksChart,
        annualChart
    ].forEach(
        (chart) => chart?.destroy()
    );

    ordersChart = null;
    booksChart = null;
    annualChart = null;
}

function calculateDailyRow(raw) {
    return {
        totalOrders:
            getNumber(raw.lecture_orders) +
            getNumber(raw.resend_orders) +
            getNumber(raw.unistudy_orders) +
            getNumber(raw.bookstore_orders),

        totalBooks:
            getNumber(raw.lecture_books) +
            getNumber(raw.resend_books) +
            getNumber(raw.unistudy_books) +
            getNumber(raw.bookstore_books)
    };
}

function getDailyValue(
    dateId,
    field
) {
    return getNumber(
        dailyMap.get(dateId)?.[field]
    );
}

function comparisonRows(
    startDateId,
    endDateId,
    field
) {
    return getDateRange(
        startDateId,
        endDateId
    ).map((currentDate) => {
        const previousDate =
            getPreviousYearDateId(
                currentDate
            );

        return {
            currentDate,
            previousDate,
            currentValue:
                getDailyValue(
                    currentDate,
                    field
                ),
            previousValue:
                getDailyValue(
                    previousDate,
                    field
                )
        };
    });
}

function setDailyRows(rows) {
    rows.forEach((row) => {
        const dateId =
            String(
                row.shipping_date ||
                row.id
            );

        if (parseDateId(dateId)) {
            dailyMap.set(
                dateId,
                calculateDailyRow(row)
            );
        }
    });
}

async function loadDailyRange(
    startDateId,
    endDateId
) {
    const previousStartDateId =
        getPreviousYearDateId(
            startDateId
        );

    const previousEndDateId =
        getPreviousYearDateId(
            endDateId
        );

    const [
        currentRows,
        previousRows
    ] = await Promise.all([
        getCollectionRowsByDocumentIdRange(
            "shippingDaily",
            startDateId,
            endDateId
        ),

        getCollectionRowsByDocumentIdRange(
            "shippingDaily",
            previousStartDateId,
            previousEndDateId
        )
    ]);

    if (!active) {
        return false;
    }

    dailyMap.clear();

    setDailyRows(currentRows);
    setDailyRows(previousRows);

    return true;
}

function drawDailyCharts(
    startDateId,
    endDateId
) {
    ordersChart?.destroy();
    booksChart?.destroy();

    ordersChart =
        createComparisonChart(
            document.getElementById(
                "ordersChart"
            ),
            comparisonRows(
                startDateId,
                endDateId,
                "totalOrders"
            ),
            "건",
            formatChartDate
        );

    booksChart =
        createComparisonChart(
            document.getElementById(
                "booksChart"
            ),
            comparisonRows(
                startDateId,
                endDateId,
                "totalBooks"
            ),
            "권",
            formatChartDate
        );

    const status =
        document.getElementById(
            "periodStatus"
        );

    status.classList.remove(
        "error"
    );

    status.textContent =
        `${formatFullDate(startDateId)} ~ ${formatFullDate(endDateId)} · 전년 동기간 비교`;
}

async function renderDailyCharts(
    startDateId,
    endDateId
) {
    const status =
        document.getElementById(
            "periodStatus"
        );

    status.classList.remove(
        "error"
    );

    status.textContent =
        "선택 기간의 출고자료를 불러오고 있습니다.";

    try {
        const loaded =
            await loadDailyRange(
                startDateId,
                endDateId
            );

        if (
            !loaded ||
            !active
        ) {
            return;
        }

        drawDailyCharts(
            startDateId,
            endDateId
        );

    } catch (error) {
        console.error(
            "[shippingDaily]",
            error
        );

        if (!active) {
            return;
        }

        status.classList.add(
            "error"
        );

        status.textContent =
            "일별 출고자료를 불러오지 못했습니다. Firestore 설정과 보안 규칙을 확인해 주십시오.";
    }
}

function populateMonthSelect() {
    const select =
        document.getElementById(
            "monthSelect"
        );

    const today =
        new Date();

    const currentYear =
        today.getFullYear();

    const currentMonth =
        today.getMonth() + 1;

    const firstYear =
        currentYear - 4;

    select.innerHTML =
        '<option value="">월 선택</option>';

    for (
        let year = currentYear;
        year >= firstYear;
        year -= 1
    ) {
        const lastMonth =
            year === currentYear
                ? currentMonth
                : 12;

        for (
            let month = lastMonth;
            month >= 1;
            month -= 1
        ) {
            const monthId =
                `${year}-${String(month).padStart(2, "0")}`;

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                monthId;

            option.textContent =
                `${year}년 ${month}월`;

            select.appendChild(
                option
            );
        }
    }
}

async function applyDefaultPeriod() {
    const today =
        new Date();

    const startDateId =
        dateToId(
            addDays(
                today,
                -30
            )
        );

    const endDateId =
        dateToId(
            addDays(
                today,
                30
            )
        );

    document.getElementById(
        "startDate"
    ).value =
        startDateId;

    document.getElementById(
        "endDate"
    ).value =
        endDateId;

    document.getElementById(
        "monthSelect"
    ).value =
        "";

    await renderDailyCharts(
        startDateId,
        endDateId
    );
}

async function searchByManualPeriod() {
    const startDateId =
        document.getElementById(
            "startDate"
        ).value;

    const endDateId =
        document.getElementById(
            "endDate"
        ).value;

    const status =
        document.getElementById(
            "periodStatus"
        );

    const start =
        parseDateId(
            startDateId
        );

    const end =
        parseDateId(
            endDateId
        );

    if (
        !start ||
        !end
    ) {
        status.classList.add(
            "error"
        );

        status.textContent =
            "시작일과 종료일을 모두 입력해 주십시오.";

        return;
    }

    if (start > end) {
        status.classList.add(
            "error"
        );

        status.textContent =
            "시작일은 종료일보다 늦을 수 없습니다.";

        return;
    }

    document.getElementById(
        "monthSelect"
    ).value =
        "";

    await renderDailyCharts(
        startDateId,
        endDateId
    );
}

async function searchByMonth(
    monthId
) {
    const bounds =
        getMonthBounds(
            monthId
        );

    if (!bounds) {
        return;
    }

    document.getElementById(
        "startDate"
    ).value =
        bounds.start;

    document.getElementById(
        "endDate"
    ).value =
        bounds.end;

    await renderDailyCharts(
        bounds.start,
        bounds.end
    );
}

function yearlyCourierData(
    rows
) {
    const result =
        new Map();

    rows.forEach((row) => {
        const monthId =
            String(
                row.base_month ||
                row.id
            );

        const match =
            /^(\d{4})-(\d{2})/.exec(
                monthId
            );

        if (!match) {
            return;
        }

        const year =
            Number(
                match[1]
            );

        const monthIndex =
            Number(
                match[2]
            ) - 1;

        if (
            !result.has(year)
        ) {
            result.set(
                year,
                Array(12).fill(0)
            );
        }

        result.get(
            year
        )[monthIndex] =
            getNumber(
                row.total_qty
            );
    });

    return result;
}

async function loadDailyData() {
    populateMonthSelect();

    await applyDefaultPeriod();
}

function getAnnualYears() {
    const currentYear =
        new Date().getFullYear();

    return Array.from(
        {
            length: 5
        },
        (_, index) =>
            currentYear - index
    );
}

async function loadAnnualYear(
    year
) {
    if (
        annualYearData.has(year)
    ) {
        return;
    }

    const rows =
        await getCollectionRowsByDocumentIdRange(
            "monthly_courier_statistics",
            `${year}-01`,
            `${year}-12`
        );

    if (!active) {
        return;
    }

    const yearlyData =
        yearlyCourierData(
            rows
        );

    annualYearData.set(
        year,
        yearlyData.get(year)
        || Array(12).fill(0)
    );
}

function renderAnnualYearLegend() {
    const legend =
        document.getElementById(
            "annualYearLegend"
        );

    if (!legend) {
        return;
    }

    legend.innerHTML =
        getAnnualYears().map(
            (year) => {
                const isLoaded =
                    annualYearData.has(year);

                const isVisible =
                    annualVisibleYears.has(year);

                const isLoading =
                    annualLoadingYears.has(year);

                return `
                    <button
                        class="annual-year-legend-item${
                            isVisible
                                ? " is-active"
                                : ""
                        }${
                            isLoaded
                                ? " is-loaded"
                                : " is-unloaded"
                        }${
                            isLoading
                                ? " is-loading"
                                : ""
                        }"
                        type="button"
                        data-annual-year="${year}"
                        data-annual-index="${
                            getAnnualYears().indexOf(year)
                        }"
                        aria-pressed="${
                            isVisible
                                ? "true"
                                : "false"
                        }"
                        ${isLoading ? "disabled" : ""}
                    >
                        <span
                            class="annual-year-legend-line"
                            aria-hidden="true"
                        ></span>
                        <span>${year}년</span>
                    </button>
                `;
            }
        ).join("");

    legend
        .querySelectorAll(
            "[data-annual-year]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                async () => {
                    const year =
                        Number(
                            button.dataset.annualYear
                        );

                    await toggleAnnualYear(
                        year
                    );
                }
            );
        });
}

function drawAnnualChart() {
    annualChart?.destroy();

    annualChart =
        createAnnualChart(
            document.getElementById(
                "annualCourierChart"
            ),
            annualYearData
        );

    annualChart.options.plugins.legend.display =
        false;

    annualChart.data.datasets.forEach(
        (dataset, index) => {
            const year =
                Number.parseInt(
                    dataset.label,
                    10
                );

            annualChart.setDatasetVisibility(
                index,
                annualVisibleYears.has(year)
            );
        }
    );

    annualChart.update("none");
}

function updateAnnualStatus(
    message = ""
) {
    const status =
        document.getElementById(
            "annualStatus"
        );

    if (!status) {
        return;
    }

    status.classList.remove(
        "error"
    );

    if (message) {
        status.textContent =
            message;

        return;
    }

    const loadedYears =
        getAnnualYears().filter(
            (year) =>
                annualYearData.has(year)
        );

    status.textContent =
        `${loadedYears.length}개 연도 조회 완료 · 미조회 연도는 범례 선택 시 불러옵니다.`;
}

async function toggleAnnualYear(
    year
) {
    if (
        annualLoadingYears.has(year)
    ) {
        return;
    }

    if (
        annualYearData.has(year)
    ) {
        if (
            annualVisibleYears.has(year)
        ) {
            annualVisibleYears.delete(
                year
            );
        } else {
            annualVisibleYears.add(
                year
            );
        }

        drawAnnualChart();
        renderAnnualYearLegend();
        updateAnnualStatus();
        return;
    }

    annualLoadingYears.add(
        year
    );

    renderAnnualYearLegend();

    updateAnnualStatus(
        `${year}년 택배자료를 불러오고 있습니다.`
    );

    try {
        await loadAnnualYear(
            year
        );

        if (!active) {
            return;
        }

        annualVisibleYears.add(
            year
        );

        drawAnnualChart();
        updateAnnualStatus();
    } catch (error) {
        console.error(
            `[monthly_courier_statistics:${year}]`,
            error
        );

        if (!active) {
            return;
        }

        const status =
            document.getElementById(
                "annualStatus"
            );

        status.classList.add(
            "error"
        );

        status.textContent =
            `${year}년 택배자료를 불러오지 못했습니다.`;
    } finally {
        annualLoadingYears.delete(
            year
        );

        if (active) {
            renderAnnualYearLegend();
        }
    }
}

async function loadAnnualData() {
    const currentYear =
        new Date().getFullYear();

    const previousYear =
        currentYear - 1;

    annualYearData.clear();
    annualVisibleYears.clear();
    annualLoadingYears.clear();

    annualVisibleYears.add(
        currentYear
    );

    annualVisibleYears.add(
        previousYear
    );

    renderAnnualYearLegend();

    await Promise.all([
        loadAnnualYear(
            currentYear
        ),
        loadAnnualYear(
            previousYear
        )
    ]);

    if (!active) {
        return;
    }

    drawAnnualChart();
    renderAnnualYearLegend();

    updateAnnualStatus(
        `${currentYear}년·${previousYear}년 최초 조회 · 다른 연도는 범례 선택 시 조회`
    );
}

export async function mount({
    content,
    actions
}) {
    active = true;

    if (
        typeof Chart ===
        "undefined"
    ) {
        throw new Error(
            "Chart.js를 불러오지 못했습니다."
        );
    }

    actions.innerHTML = `
        <div class="filters">
            <div class="datebox">
                <span aria-hidden="true">📅</span>

                <input
                    id="startDate"
                    type="date"
                    aria-label="시작일"
                >

                <span>~</span>

                <input
                    id="endDate"
                    type="date"
                    aria-label="종료일"
                >
            </div>

            <button
                id="searchButton"
                class="btn primary"
                type="button"
            >
                조회
            </button>

            <div class="monthbox">
                <span class="monthbox-label">
                    월별조회
                </span>

                <select
                    id="monthSelect"
                    aria-label="월별조회"
                >
                    <option value="">
                        월 선택
                    </option>
                </select>
            </div>
        </div>
    `;

    content.innerHTML = `
        <section class="period-row">
            <p
                id="periodStatus"
                class="period-status"
            >
                일별 출고자료를 불러오고 있습니다.
            </p>
        </section>

        <section class="chart-grid">
            <article class="chart-card">
                <div class="chart-head">
                    <div>
                        <div class="chart-title">
                            전체 출고 건수
                        </div>

                        <div class="chart-sub">
                            금년 vs 전년 동기간
                        </div>
                    </div>

                    <div class="chart-legend">
                        <span class="legend-item">
                            <span
                                class="legend-line legend-current"
                            ></span>
                            금년
                        </span>

                        <span class="legend-item">
                            <span
                                class="legend-line legend-previous"
                            ></span>
                            전년 동기간
                        </span>
                    </div>
                </div>

                <div class="chart-box">
                    <canvas id="ordersChart"></canvas>
                </div>
            </article>

            <article class="chart-card">
                <div class="chart-head">
                    <div>
                        <div class="chart-title">
                            전체 출고 권수
                        </div>

                        <div class="chart-sub">
                            금년 vs 전년 동기간
                        </div>
                    </div>

                    <div class="chart-legend">
                        <span class="legend-item">
                            <span
                                class="legend-line legend-current"
                            ></span>
                            금년
                        </span>

                        <span class="legend-item">
                            <span
                                class="legend-line legend-previous"
                            ></span>
                            전년 동기간
                        </span>
                    </div>
                </div>

                <div class="chart-box">
                    <canvas id="booksChart"></canvas>
                </div>
            </article>

            <article class="chart-card">
                <div class="chart-head">
                    <div>
                        <div class="chart-title">
                            연간 택배 발송 건수
                        </div>

                        <div class="chart-sub">
                            1월~12월 월간 합계 · 연도별 비교
                        </div>
                    </div>

                </div>

                <p
                    id="annualStatus"
                    class="annual-status annual-lazy-status"
                    hidden
                ></p>

                <div class="chart-box annual-chart-box annual-chart-with-legend">
                    <canvas id="annualCourierChart"></canvas>

                    <div
                        id="annualYearLegend"
                        class="annual-year-legend"
                        aria-label="연도 선택"
                    ></div>
                </div>
            </article>
        </section>
    `;

    document
        .getElementById(
            "searchButton"
        )
        .addEventListener(
            "click",
            searchByManualPeriod
        );

    document
        .getElementById(
            "monthSelect"
        )
        .addEventListener(
            "change",
            (event) => {
                searchByMonth(
                    event.target.value
                );
            }
        );

    const [
        dailyResult,
        annualResult
    ] = await Promise.allSettled([
        loadDailyData(),
        loadAnnualData()
    ]);

    if (!active) {
        return;
    }

    if (
        dailyResult.status ===
        "rejected"
    ) {
        console.error(
            "[shippingDaily]",
            dailyResult.reason
        );

        const status =
            document.getElementById(
                "periodStatus"
            );

        status.classList.add(
            "error"
        );

        status.textContent =
            "일별 출고자료를 불러오지 못했습니다. Firestore 설정과 보안 규칙을 확인해 주십시오.";
    }

    if (
        annualResult.status ===
        "rejected"
    ) {
        console.error(
            "[monthly_courier_statistics]",
            annualResult.reason
        );

        const status =
            document.getElementById(
                "annualStatus"
            );

        status.classList.add(
            "error"
        );

        status.textContent =
            "연간 택배자료를 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
    annualLoadingYears.clear();
    destroyCharts();
}
