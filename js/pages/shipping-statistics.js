// /js/pages/shipping-statistics.js

import {
    getCollectionRowsByDocumentIdRange,
    getDocumentRow
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
import {
    getCachedData,
    getDataVersion,
    setCachedData
} from "../services/data-cache.js";

export const title = "발송 통계";

const YEARLY_SUMMARY_COLLECTION = "yearly_dashboard_statistics";
const CACHE_SCOPE = "shipping_statistics";
const CACHE_TTL_MS = 60 * 60 * 1000;
const dailyMap = new Map();

let ordersChart = null;
let booksChart = null;
let annualChart = null;
let active = false;
let cacheVersion = null;

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

function getMonthIdsForRange(
    startDateId,
    endDateId
) {
    const start =
        parseDateId(startDateId);

    const end =
        parseDateId(endDateId);

    if (
        !start ||
        !end
    ) {
        return [];
    }

    const monthIds = [];
    const cursor =
        new Date(
            start.getFullYear(),
            start.getMonth(),
            1
        );

    const endMonth =
        new Date(
            end.getFullYear(),
            end.getMonth(),
            1
        );

    while (cursor <= endMonth) {
        monthIds.push(
            `${cursor.getFullYear()}-${String(
                cursor.getMonth() + 1
            ).padStart(2, "0")}`
        );

        cursor.setMonth(
            cursor.getMonth() + 1
        );
    }

    return monthIds;
}

function setMonthlySummaryRows(
    monthlyDocuments
) {
    monthlyDocuments.forEach((documentRow) => {
        if (
            !documentRow ||
            !documentRow.days ||
            typeof documentRow.days !== "object"
        ) {
            return;
        }

        setDailyRows(
            Object.values(
                documentRow.days
            )
        );
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

    const monthIds =
        Array.from(
            new Set([
                ...getMonthIdsForRange(
                    startDateId,
                    endDateId
                ),
                ...getMonthIdsForRange(
                    previousStartDateId,
                    previousEndDateId
                )
            ])
        );

    const monthlyDocuments =
        await Promise.all(
            monthIds.map(async (monthId) => {
                const cacheKey = `daily:${monthId}`;
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
                    "shipping_daily_monthly",
                    monthId
                );

                setCachedData(
                    CACHE_SCOPE,
                    cacheKey,
                    cacheVersion,
                    row
                );

                return row;
            })
        );

    if (!active) {
        return false;
    }

    dailyMap.clear();
    setMonthlySummaryRows(
        monthlyDocuments
    );

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
        const year =
            Number(
                row.base_year ||
                row.id
            );

        if (!Number.isFinite(year)) {
            return;
        }

        const monthly =
            row.monthly || {};

        const monthlyValues =
            Array(12).fill(0);

        for (
            let month = 1;
            month <= 12;
            month += 1
        ) {
            const monthKey =
                String(month).padStart(
                    2,
                    "0"
                );

            monthlyValues[month - 1] =
                getNumber(
                    monthly[monthKey]
                        ?.courier
                        ?.total_qty
                );
        }

        result.set(
            year,
            monthlyValues
        );
    });

    return result;
}

async function loadDailyData() {
    populateMonthSelect();

    await applyDefaultPeriod();
}

async function loadAnnualData() {
    const currentYear =
        new Date().getFullYear();

    const firstYear =
        currentYear - 4;

    const cacheKey =
        `annual:${firstYear}-${currentYear}`;

    let rows = getCachedData(
        CACHE_SCOPE,
        cacheKey,
        cacheVersion,
        CACHE_TTL_MS
    );

    if (rows === null) {
        rows =
            await getCollectionRowsByDocumentIdRange(
                YEARLY_SUMMARY_COLLECTION,
                String(firstYear),
                String(currentYear)
            );

        setCachedData(
            CACHE_SCOPE,
            cacheKey,
            cacheVersion,
            rows
        );
    }

    if (!active) {
        return;
    }

    const yearlyData =
        yearlyCourierData(
            rows
        );

    annualChart?.destroy();

    annualChart =
        createAnnualChart(
            document.getElementById(
                "annualCourierChart"
            ),
            yearlyData
        );

    const status =
        document.getElementById(
            "annualStatus"
        );

    status.classList.remove(
        "error"
    );

    status.textContent =
        `${firstYear}~${currentYear} · 범례를 누르면 해당 연도를 숨기거나 표시할 수 있습니다.`;
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

                    <p
                        id="annualStatus"
                        class="annual-status"
                    >
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
            "[yearly_dashboard_statistics]",
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
    destroyCharts();
}
