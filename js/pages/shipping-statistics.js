// /js/pages/shipping-statistics.js

import { getCollectionRows } from "../services/firestore-service.js";
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
let ordersChart = null;
let booksChart = null;
let annualChart = null;
let active = false;

function destroyCharts() {
    [ordersChart, booksChart, annualChart].forEach((chart) => chart?.destroy());
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

function getDailyValue(dateId, field) {
    return getNumber(dailyMap.get(dateId)?.[field]);
}

function comparisonRows(startDateId, endDateId, field) {
    return getDateRange(startDateId, endDateId).map((currentDate) => {
        const previousDate = getPreviousYearDateId(currentDate);

        return {
            currentDate,
            previousDate,
            currentValue: getDailyValue(currentDate, field),
            previousValue: getDailyValue(previousDate, field)
        };
    });
}

function renderDailyCharts(startDateId, endDateId) {
    ordersChart?.destroy();
    booksChart?.destroy();

    ordersChart = createComparisonChart(
        document.getElementById("ordersChart"),
        comparisonRows(startDateId, endDateId, "totalOrders"),
        "건",
        formatChartDate
    );

    booksChart = createComparisonChart(
        document.getElementById("booksChart"),
        comparisonRows(startDateId, endDateId, "totalBooks"),
        "권",
        formatChartDate
    );

    const status = document.getElementById("periodStatus");
    status.classList.remove("error");
    status.textContent =
        `${formatFullDate(startDateId)} ~ ${formatFullDate(endDateId)} · 전년 동기간 비교`;
}

function populateMonthSelect() {
    const select = document.getElementById("monthSelect");

    const months = new Set(
        Array.from(dailyMap.keys()).map((dateId) => dateId.slice(0, 7))
    );

    months.add(dateToId(new Date()).slice(0, 7));

    select.innerHTML = '<option value="">월 선택</option>';

    Array.from(months)
        .sort((a, b) => b.localeCompare(a))
        .forEach((monthId) => {
            const [year, month] = monthId.split("-");
            const option = document.createElement("option");

            option.value = monthId;
            option.textContent = `${year}년 ${Number(month)}월`;

            select.appendChild(option);
        });
}

function applyDefaultPeriod() {
    const today = new Date();

    const startDateId = dateToId(addDays(today, -30));
    const endDateId = dateToId(addDays(today, 30));

    document.getElementById("startDate").value = startDateId;
    document.getElementById("endDate").value = endDateId;
    document.getElementById("monthSelect").value = "";

    renderDailyCharts(startDateId, endDateId);
}

function searchByManualPeriod() {
    const startDateId = document.getElementById("startDate").value;
    const endDateId = document.getElementById("endDate").value;
    const status = document.getElementById("periodStatus");

    const start = parseDateId(startDateId);
    const end = parseDateId(endDateId);

    if (!start || !end) {
        status.classList.add("error");
        status.textContent = "시작일과 종료일을 모두 입력해 주십시오.";
        return;
    }

    if (start > end) {
        status.classList.add("error");
        status.textContent = "시작일은 종료일보다 늦을 수 없습니다.";
        return;
    }

    document.getElementById("monthSelect").value = "";

    renderDailyCharts(startDateId, endDateId);
}

function searchByMonth(monthId) {
    const bounds = getMonthBounds(monthId);

    if (!bounds) {
        return;
    }

    document.getElementById("startDate").value = bounds.start;
    document.getElementById("endDate").value = bounds.end;

    renderDailyCharts(bounds.start, bounds.end);
}

function yearlyCourierData(rows) {
    const result = new Map();

    rows.forEach((row) => {
        const monthId = String(row.base_month || row.id);
        const match = /^(\d{4})-(\d{2})/.exec(monthId);

        if (!match) {
            return;
        }

        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;

        if (!result.has(year)) {
            result.set(year, Array(12).fill(0));
        }

        result.get(year)[monthIndex] = getNumber(row.total_qty);
    });

    return result;
}

function recentFiveYearCourierData(yearlyData) {
    const currentYear = new Date().getFullYear();
    const firstYear = currentYear - 4;
    const result = new Map();

    yearlyData.forEach((values, year) => {
        if (year >= firstYear && year <= currentYear) {
            result.set(year, values);
        }
    });

    return result;
}

async function loadDailyData() {
    const rows = await getCollectionRows("shippingDaily");

    dailyMap.clear();

    rows.forEach((row) => {
        const dateId = String(row.shipping_date || row.id);

        if (parseDateId(dateId)) {
            dailyMap.set(dateId, calculateDailyRow(row));
        }
    });

    if (!active) {
        return;
    }

    populateMonthSelect();
    applyDefaultPeriod();
}

async function loadAnnualData() {
    const rows = await getCollectionRows("monthly_courier_statistics");

    if (!active) {
        return;
    }

    const allYearlyData = yearlyCourierData(rows);
    const recentYearlyData = recentFiveYearCourierData(allYearlyData);

    annualChart?.destroy();

    annualChart = createAnnualChart(
        document.getElementById("annualCourierChart"),
        recentYearlyData
    );

    const status = document.getElementById("annualStatus");
    const currentYear = new Date().getFullYear();
    const firstYear = currentYear - 4;

    status.classList.remove("error");
    status.textContent =
        `${firstYear}~${currentYear} · 범례를 누르면 해당 연도를 숨기거나 표시할 수 있습니다.`;
}

export async function mount({ content, actions }) {
    active = true;

    if (typeof Chart === "undefined") {
        throw new Error("Chart.js를 불러오지 못했습니다.");
    }

    actions.innerHTML = `
        <div class="filters">
            <div class="datebox">
                <span aria-hidden="true">📅</span>
                <input id="startDate" type="date" aria-label="시작일">
                <span>~</span>
                <input id="endDate" type="date" aria-label="종료일">
            </div>

            <button
                id="searchButton"
                class="btn primary"
                type="button"
            >
                조회
            </button>

            <div class="monthbox">
                <span class="monthbox-label">월별조회</span>

                <select
                    id="monthSelect"
                    aria-label="월별조회"
                >
                    <option value="">월 선택</option>
                </select>
            </div>
        </div>
    `;

    content.innerHTML = `
        <section class="period-row">
            <p id="periodStatus" class="period-status">
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
                            <span class="legend-line legend-current"></span>
                            금년
                        </span>

                        <span class="legend-item">
                            <span class="legend-line legend-previous"></span>
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
                            <span class="legend-line legend-current"></span>
                            금년
                        </span>

                        <span class="legend-item">
                            <span class="legend-line legend-previous"></span>
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

                    <p id="annualStatus" class="annual-status">
                        월간 택배자료를 불러오고 있습니다.
                    </p>
                </div>

                <div class="chart-box annual-chart-box">
                    <canvas id="annualCourierChart"></canvas>
                </div>
            </article>
        </section>
    `;

    document
        .getElementById("searchButton")
        .addEventListener("click", searchByManualPeriod);

    document
        .getElementById("monthSelect")
        .addEventListener("change", (event) => {
            searchByMonth(event.target.value);
        });

    const [dailyResult, annualResult] = await Promise.allSettled([
        loadDailyData(),
        loadAnnualData()
    ]);

    if (!active) {
        return;
    }

    if (dailyResult.status === "rejected") {
        console.error("[shippingDaily]", dailyResult.reason);

        const status = document.getElementById("periodStatus");

        status.classList.add("error");
        status.textContent =
            "일별 출고자료를 불러오지 못했습니다. Firestore 설정과 보안 규칙을 확인해 주십시오.";
    }

    if (annualResult.status === "rejected") {
        console.error(
            "[monthly_courier_statistics]",
            annualResult.reason
        );

        const status = document.getElementById("annualStatus");

        status.classList.add("error");
        status.textContent =
            "연간 택배자료를 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
    destroyCharts();
}
