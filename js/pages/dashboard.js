// /js/pages/dashboard.js

import {
    getCollectionRowsByDocumentIdPrefix,
    getCollectionRowsByFieldEqualsAndRange,
    getDocumentRow
} from "../services/firestore-service.js";
import { addDays, dateToId } from "../utils/date-utils.js";
import {
    calculateChangeRate,
    formatSignedValue,
    getNumber
} from "../utils/number-utils.js";
import { createAnnualChart } from "../utils/chart-utils.js";

export const title = "Dashboard";

let active = false;
let lectureChart = null;
let bookstoreChart = null;
let unistudyChart = null;
let instructorSalesChart = null;

function formatNumber(value) {
    return getNumber(value).toLocaleString("ko-KR");
}

function formatRate(value) {
    return `${getNumber(value).toFixed(1)}%`;
}

function formatShortDate(dateId) {
    if (!dateId || dateId.length < 10) {
        return "-";
    }

    const [, month, day] = dateId.split("-");

    return `${Number(month)}/${Number(day)}`;
}

function destroyCharts() {
    [
        lectureChart,
        bookstoreChart,
        unistudyChart,
        instructorSalesChart
    ].forEach((chart) => {
        chart?.destroy();
    });

    lectureChart = null;
    bookstoreChart = null;
    unistudyChart = null;
    instructorSalesChart = null;
}

function getIsoWeekParts(date) {
    const utcDate = new Date(
        Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        )
    );

    const weekday =
        utcDate.getUTCDay() || 7;

    utcDate.setUTCDate(
        utcDate.getUTCDate()
        + 4
        - weekday
    );

    const isoYear =
        utcDate.getUTCFullYear();

    const yearStart =
        new Date(
            Date.UTC(
                isoYear,
                0,
                1
            )
        );

    const week =
        Math.ceil(
            (
                (
                    (utcDate - yearStart)
                    / 86400000
                )
                + 1
            )
            / 7
        );

    return {
        isoYear,
        week,
        weekday
    };
}

function dateFromIsoWeek(
    isoYear,
    week,
    weekday
) {
    const januaryFourth =
        new Date(
            Date.UTC(
                isoYear,
                0,
                4
            )
        );

    const januaryFourthWeekday =
        januaryFourth.getUTCDay() || 7;

    const monday =
        new Date(januaryFourth);

    monday.setUTCDate(
        januaryFourth.getUTCDate()
        - januaryFourthWeekday
        + 1
    );

    const result =
        new Date(monday);

    result.setUTCDate(
        monday.getUTCDate()
        + ((week - 1) * 7)
        + (weekday - 1)
    );

    return new Date(
        result.getUTCFullYear(),
        result.getUTCMonth(),
        result.getUTCDate(),
        12,
        0,
        0,
        0
    );
}

function getPreviousYearComparableDate(date) {
    const currentIso =
        getIsoWeekParts(date);

    const targetIsoYear =
        currentIso.isoYear - 1;

    const candidate =
        dateFromIsoWeek(
            targetIsoYear,
            currentIso.week,
            currentIso.weekday
        );

    const candidateIso =
        getIsoWeekParts(candidate);

    if (
        candidateIso.isoYear === targetIsoYear
        && candidateIso.week === currentIso.week
        && candidateIso.weekday === currentIso.weekday
    ) {
        return candidate;
    }

    const fallback =
        new Date(date);

    fallback.setDate(
        fallback.getDate() - 364
    );

    return fallback;
}

function getLocalStatus(localRow) {
    const workOrders =
        getNumber(
            localRow?.work_orders
        );

    const completedOrders =
        getNumber(
            localRow?.completed_orders
        );

    if (
        workOrders === 0
        && completedOrders === 0
    ) {
        return {
            text: "대기",
            className: "is-waiting"
        };
    }

    if (
        workOrders > 0
        && completedOrders >= workOrders
    ) {
        return {
            text: "완료",
            className: "is-complete"
        };
    }

    return {
        text: "작업중",
        className: "is-working"
    };
}

function getLocalProgressRate(localRow) {
    const workOrders =
        getNumber(
            localRow?.work_orders
        );

    const completedOrders =
        getNumber(
            localRow?.completed_orders
        );

    if (workOrders <= 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.max(
            0,
            (completedOrders / workOrders) * 100
        )
    );
}


function createLocalMarkup() {
    return Array.from(
        {
            length: 9
        },
        (_, index) => {
            const localNumber =
                index + 1;

            return `
                <div class="local-status-item">
                    <span class="local-status-number">
                        ${localNumber}
                    </span>

                    <strong
                        id="localStatus${localNumber}"
                        class="local-status-badge is-waiting"
                    >
                        대기
                    </strong>

                    <div class="local-work-values">
                        <div class="local-work-row">
                            <span>작업 건수</span>

                            <strong
                                id="localOrders${localNumber}"
                            >
                                0건
                            </strong>
                        </div>

                        <div class="local-work-row">
                            <span>작업 권수</span>

                            <strong
                                id="localBooks${localNumber}"
                            >
                                0권
                            </strong>
                        </div>
                    </div>

                    <div
                        id="localProgress${localNumber}"
                        class="local-progress-rate"
                    >
                        진행률 0%
                    </div>
                </div>
            `;
        }
    ).join("");
}


function getCurrentMonthId() {
    const today = new Date();

    return (
        `${today.getFullYear()}-`
        + `${String(today.getMonth() + 1).padStart(2, "0")}`
    );
}

function getPreviousYearMonthId(monthId) {
    const match = /^(\d{4})-(\d{2})$/.exec(
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

function renderInstructorSalesTable(
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
                    currentValue -
                    previousValue;

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
                            ${instructorName}
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

async function loadInstructorSalesComparison(
    monthId
) {
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

    renderInstructorSalesTable(
        monthId,
        currentRows,
        previousRows
    );

    status.textContent =
        `${previousMonthId} / ${monthId} 비교`;
}

function buildInstructorYearlyData(
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

async function loadInstructorSalesTrend(
    instructorName
) {
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

    instructorSalesChart?.destroy();
    instructorSalesChart = null;

    if (!rows.length) {
        status.textContent =
            `${normalizedName}: 최근 5개년 매출 데이터가 없습니다.`;

        return;
    }

    const yearlyData =
        buildInstructorYearlyData(
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

    status.textContent =
        `${normalizedName} · ${firstYear}~${currentYear} · 월별 교재매출`;
}

async function searchInstructorSalesComparison() {
    const monthId =
        document.getElementById(
            "instructorSalesMonth"
        ).value;

    if (!monthId) {
        return;
    }

    try {
        await loadInstructorSalesComparison(
            monthId
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

async function searchInstructorSalesTrend() {
    const instructorName =
        document.getElementById(
            "instructorNameSearch"
        ).value;

    try {
        await loadInstructorSalesTrend(
            instructorName
        );
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

function createDashboardMarkup() {
    return `
        <section class="dashboard-date-card">
            <div class="dashboard-date-primary">
                <span class="dashboard-date-label">
                    기준일자:
                </span>

                <strong
                    id="dashboardDate"
                    class="dashboard-date-value"
                >
                    -
                </strong>
            </div>

            <div class="dashboard-update-meta">
                <span class="dashboard-update-label">
                    최종 업데이트:
                </span>

                <strong
                    id="dashboardUpdatedAt"
                    class="dashboard-update-value"
                >
                    -
                </strong>
            </div>
        </section>

        <section class="dashboard-top-grid">
            <article class="dashboard-card attendance-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>출근 현황</h2>
                        <p>오늘 출근 인원</p>
                    </div>
                </div>

                <div class="attendance-card-grid">
                    <div class="attendance-stat-card">
                        <span class="attendance-stat-label">
                            직원
                        </span>

                        <strong
                            id="employeeCount"
                            class="attendance-stat-value"
                        >
                            0명
                        </strong>
                    </div>

                    <div class="attendance-stat-card">
                        <span class="attendance-stat-label">
                            아르바이트
                        </span>

                        <strong
                            id="partTimeCount"
                            class="attendance-stat-value"
                        >
                            0명
                        </strong>

                        <div class="attendance-part-time-detail">
                            <span id="partTimeMorningCount">
                                오전: 0명
                            </span>

                            <span id="partTimeAfternoonCount">
                                오후: 0명
                            </span>
                        </div>
                    </div>
                </div>
            </article>

            <article class="dashboard-card local-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>로컬 상태</h2>
                        <p>인강 로컬 1~9 작업 상태</p>
                    </div>
                </div>

                <div class="local-status-grid">
                    ${createLocalMarkup()}
                </div>
            </article>
        </section>

        <section class="dashboard-work-grid">
            <article class="dashboard-card work-summary-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>인강</h2>

                        <p id="dashboardStatus">
                            오늘 작업현황을 불러오고 있습니다.
                        </p>
                    </div>
                </div>

                <div class="work-table-wrap">
                    <div class="work-table work-table-five-column">
                        <div class="work-table-row work-table-header">
                            <span>구분</span>
                            <span>전체</span>
                            <span>처리</span>
                            <span>미처리</span>
                            <span>진행률</span>
                        </div>

                        <div class="work-table-row">
                            <span>건수</span>

                            <strong id="lectureTotalOrders">
                                0건
                            </strong>

                            <strong id="lectureCompletedOrders">
                                0건
                            </strong>

                            <strong id="lecturePendingOrders">
                                0건
                            </strong>

                            <strong id="lectureOrderProgress">
                                0.0%
                            </strong>
                        </div>

                        <div class="work-table-row">
                            <span>권수</span>

                            <strong id="lectureTotalBooks">
                                0권
                            </strong>

                            <strong id="lectureCompletedBooks">
                                0권
                            </strong>

                            <strong id="lecturePendingBooks">
                                0권
                            </strong>

                            <strong id="lectureBookProgress">
                                0.0%
                            </strong>
                        </div>
                    </div>
                </div>
            </article>

            <article class="dashboard-card work-summary-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>온라인서점/유니스터디</h2>
                        <p>오늘 발송량</p>
                    </div>
                </div>

                <div class="work-table-wrap">
                    <div class="work-table work-table-three-column">
                        <div class="work-table-row work-table-header">
                            <span>구분</span>
                            <span>건수</span>
                            <span>권수</span>
                        </div>

                        <div class="work-table-row">
                            <span>온라인서점</span>

                            <strong id="bookstoreOrders">
                                0건
                            </strong>

                            <strong id="bookstoreBooks">
                                0권
                            </strong>
                        </div>

                        <div class="work-table-row">
                            <span>유니스터디</span>

                            <strong id="unistudyOrders">
                                0건
                            </strong>

                            <strong id="unistudyBooks">
                                0권
                            </strong>
                        </div>
                    </div>
                </div>
            </article>
        </section>

        <section class="dashboard-instructor-grid">
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

        <section class="dashboard-chart-grid">
            <article class="dashboard-card dashboard-chart-card">
                <div class="dashboard-card-header dashboard-chart-header">
                    <div>
                        <h2>인강 비교</h2>

                        <p id="lectureChartPeriod">
                            오늘 / 전일 / 전년동기
                        </p>
                    </div>
                </div>

                <div class="dashboard-chart-box">
                    <canvas id="lectureCompareChart"></canvas>
                </div>
            </article>

            <article class="dashboard-card dashboard-chart-card">
                <div class="dashboard-card-header dashboard-chart-header">
                    <div>
                        <h2>온라인서점 비교</h2>

                        <p id="bookstoreChartPeriod">
                            오늘 / 전일 / 전년동기
                        </p>
                    </div>
                </div>

                <div class="dashboard-chart-box">
                    <canvas id="bookstoreCompareChart"></canvas>
                </div>
            </article>

            <article class="dashboard-card dashboard-chart-card">
                <div class="dashboard-card-header dashboard-chart-header">
                    <div>
                        <h2>유니스터디 비교</h2>

                        <p id="unistudyChartPeriod">
                            오늘 / 전일 / 전년동기
                        </p>
                    </div>
                </div>

                <div class="dashboard-chart-box">
                    <canvas id="unistudyCompareChart"></canvas>
                </div>
            </article>
        </section>
    `;
}

function renderLocalStatuses(row) {
    const locals =
        row?.locals || {};

    for (
        let index = 1;
        index <= 9;
        index += 1
    ) {
        const localId =
            `LOCAL_${String(index).padStart(2, "0")}`;

        const localRow =
            locals[localId] || {};

        const status =
            getLocalStatus(localRow);

        const statusElement =
            document.getElementById(
                `localStatus${index}`
            );

        const ordersElement =
            document.getElementById(
                `localOrders${index}`
            );

        const booksElement =
            document.getElementById(
                `localBooks${index}`
            );

        const progressElement =
            document.getElementById(
                `localProgress${index}`
            );

        if (statusElement) {
            statusElement.textContent =
                status.text;

            statusElement.classList.remove(
                "is-waiting",
                "is-working",
                "is-complete"
            );

            statusElement.classList.add(
                status.className
            );
        }

        if (ordersElement) {
            ordersElement.textContent =
                `${formatNumber(
                    localRow.work_orders
                )}건`;
        }

        if (booksElement) {
            booksElement.textContent =
                `${formatNumber(
                    localRow.work_books
                )}권`;
        }

        if (progressElement) {
            progressElement.textContent =
                `진행률 ${getLocalProgressRate(
                    localRow
                ).toFixed(0)}%`;
        }
    }
}

function renderDashboardRow(
    row,
    todayId
) {
    const attendance =
        row?.attendance || {};

    document.getElementById(
        "dashboardDate"
    ).textContent =
        todayId;

    document.getElementById(
        "dashboardUpdatedAt"
    ).textContent =
        row.firestore_updated_at || "-";

    document.getElementById(
        "employeeCount"
    ).textContent =
        `${formatNumber(
            attendance.employee_count
        )}명`;

    document.getElementById(
        "partTimeCount"
    ).textContent =
        `${formatNumber(
            attendance.part_time_count
        )}명`;

    document.getElementById(
        "partTimeMorningCount"
    ).textContent =
        `오전: ${formatNumber(
            attendance.part_time_morning_count
        )}명`;

    document.getElementById(
        "partTimeAfternoonCount"
    ).textContent =
        `오후: ${formatNumber(
            attendance.part_time_afternoon_count
        )}명`;

    document.getElementById(
        "lectureTotalOrders"
    ).textContent =
        `${formatNumber(
            row.total_orders
        )}건`;

    document.getElementById(
        "lectureCompletedOrders"
    ).textContent =
        `${formatNumber(
            row.completed_orders
        )}건`;

    document.getElementById(
        "lecturePendingOrders"
    ).textContent =
        `${formatNumber(
            row.pending_orders
        )}건`;

    document.getElementById(
        "lectureOrderProgress"
    ).textContent =
        formatRate(
            row.order_progress_rate
        );

    document.getElementById(
        "lectureTotalBooks"
    ).textContent =
        `${formatNumber(
            row.total_books
        )}권`;

    document.getElementById(
        "lectureCompletedBooks"
    ).textContent =
        `${formatNumber(
            row.completed_books
        )}권`;

    document.getElementById(
        "lecturePendingBooks"
    ).textContent =
        `${formatNumber(
            row.pending_books
        )}권`;

    document.getElementById(
        "lectureBookProgress"
    ).textContent =
        formatRate(
            row.book_progress_rate
        );

    document.getElementById(
        "bookstoreOrders"
    ).textContent =
        `${formatNumber(
            row.bookstore_orders
        )}건`;

    document.getElementById(
        "bookstoreBooks"
    ).textContent =
        `${formatNumber(
            row.bookstore_books
        )}권`;

    document.getElementById(
        "unistudyOrders"
    ).textContent =
        `${formatNumber(
            row.unistudy_orders
        )}건`;

    document.getElementById(
        "unistudyBooks"
    ).textContent =
        `${formatNumber(
            row.unistudy_books
        )}권`;

    document.getElementById(
        "dashboardStatus"
    ).textContent =
        "오늘 작업현황";

    renderLocalStatuses(row);
}

function createComparisonChart(
    canvasId,
    values
) {
    const canvas =
        document.getElementById(
            canvasId
        );

    const todayValueLabelPlugin = {
        id: `todayValueLabel-${canvasId}`,

        afterDatasetsDraw(chart) {
            const { ctx } = chart;

            chart.data.datasets.forEach(
                (dataset, datasetIndex) => {
                    const meta =
                        chart.getDatasetMeta(
                            datasetIndex
                        );

                    const bar =
                        meta.data[0];

                    if (!bar) {
                        return;
                    }

                    const value =
                        getNumber(
                            dataset.data[0]
                        );

                    const unit =
                        dataset.label === "건수"
                            ? "건"
                            : "권";

                    const text =
                        `${formatNumber(value)}${unit}`;

                    ctx.save();

                    ctx.font =
                        "700 10px Pretendard, sans-serif";

                    ctx.fillStyle =
                        "#173c6e";

                    ctx.textAlign =
                        "center";

                    ctx.textBaseline =
                        "bottom";

                    ctx.fillText(
                        text,
                        bar.x,
                        bar.y - 5
                    );

                    ctx.restore();
                }
            );
        }
    };

    return new Chart(
        canvas,
        {
            type: "bar",

            data: {
                labels: [
                    "오늘",
                    "전일",
                    "전년동기"
                ],

                datasets: [
                    {
                        label: "건수",

                        data: [
                            getNumber(
                                values.todayOrders
                            ),
                            getNumber(
                                values.yesterdayOrders
                            ),
                            getNumber(
                                values.previousYearOrders
                            )
                        ],

                        backgroundColor: [
                            "#0f6fe8",
                            "#d7e0eb",
                            "#d7e0eb"
                        ],

                        borderColor: [
                            "#0b62cf",
                            "#d7e0eb",
                            "#d7e0eb"
                        ],

                        borderWidth: [
                            2,
                            0,
                            0
                        ],

                        borderRadius: 5,
                        maxBarThickness: 30
                    },
                    {
                        label: "권수",

                        data: [
                            getNumber(
                                values.todayBooks
                            ),
                            getNumber(
                                values.yesterdayBooks
                            ),
                            getNumber(
                                values.previousYearBooks
                            )
                        ],

                        backgroundColor: [
                            "#173c6e",
                            "#b8c4d1",
                            "#b8c4d1"
                        ],

                        borderColor: [
                            "#0f2f59",
                            "#b8c4d1",
                            "#b8c4d1"
                        ],

                        borderWidth: [
                            2,
                            0,
                            0
                        ],

                        borderRadius: 5,
                        maxBarThickness: 30
                    }
                ]
            },

            plugins: [
                todayValueLabelPlugin
            ],

            options: {
                responsive: true,
                maintainAspectRatio: false,

                layout: {
                    padding: {
                        top: 18
                    }
                },

                interaction: {
                    mode: "index",
                    intersect: false
                },

                plugins: {
                    legend: {
                        position: "top",

                        labels: {
                            boxWidth: 10,
                            boxHeight: 10,
                            usePointStyle: true,

                            font: {
                                size: 11,
                                weight: "700"
                            }
                        }
                    },

                    tooltip: {
                        callbacks: {
                            label(context) {
                                const unit =
                                    context.dataset.label ===
                                    "건수"
                                        ? "건"
                                        : "권";

                                return (
                                    `${context.dataset.label}: `
                                    + `${formatNumber(
                                        context.raw
                                    )}${unit}`
                                );
                            }
                        }
                    }
                },

                scales: {
                    x: {
                        grid: {
                            display: false
                        },

                        ticks: {
                            color(context) {
                                return (
                                    context.index === 0
                                        ? "#173c6e"
                                        : "#8a98aa"
                                );
                            },

                            font(context) {
                                return {
                                    size:
                                        context.index === 0
                                            ? 12
                                            : 11,

                                    weight:
                                        context.index === 0
                                            ? "900"
                                            : "700"
                                };
                            }
                        }
                    },

                    y: {
                        beginAtZero: true,

                        grid: {
                            color: "#e9eef5"
                        },

                        ticks: {
                            color: "#728197",
                            precision: 0,

                            font: {
                                size: 10
                            },

                            callback(value) {
                                return Number(
                                    value
                                ).toLocaleString(
                                    "ko-KR"
                                );
                            }
                        }
                    }
                }
            }
        }
    );
}

function renderComparisonCharts(
    todayRow,
    yesterdayRow,
    previousYearRow,
    yesterdayId,
    previousYearId
) {
    destroyCharts();

    const periodText =
        `전일 ${formatShortDate(yesterdayId)}`
        + ` · 전년동기 ${previousYearId}`;

    document.getElementById(
        "lectureChartPeriod"
    ).textContent =
        periodText;

    document.getElementById(
        "bookstoreChartPeriod"
    ).textContent =
        periodText;

    document.getElementById(
        "unistudyChartPeriod"
    ).textContent =
        periodText;

    lectureChart =
        createComparisonChart(
            "lectureCompareChart",
            {
                todayOrders:
                    todayRow?.total_orders,

                todayBooks:
                    todayRow?.total_books,

                yesterdayOrders:
                    yesterdayRow?.lecture_orders,

                yesterdayBooks:
                    yesterdayRow?.lecture_books,

                previousYearOrders:
                    previousYearRow?.lecture_orders,

                previousYearBooks:
                    previousYearRow?.lecture_books
            }
        );

    bookstoreChart =
        createComparisonChart(
            "bookstoreCompareChart",
            {
                todayOrders:
                    todayRow?.bookstore_orders,

                todayBooks:
                    todayRow?.bookstore_books,

                yesterdayOrders:
                    yesterdayRow?.bookstore_orders,

                yesterdayBooks:
                    yesterdayRow?.bookstore_books,

                previousYearOrders:
                    previousYearRow?.bookstore_orders,

                previousYearBooks:
                    previousYearRow?.bookstore_books
            }
        );

    unistudyChart =
        createComparisonChart(
            "unistudyCompareChart",
            {
                todayOrders:
                    todayRow?.unistudy_orders,

                todayBooks:
                    todayRow?.unistudy_books,

                yesterdayOrders:
                    yesterdayRow?.unistudy_orders,

                yesterdayBooks:
                    yesterdayRow?.unistudy_books,

                previousYearOrders:
                    previousYearRow?.unistudy_orders,

                previousYearBooks:
                    previousYearRow?.unistudy_books
            }
        );
}

async function loadDashboardData() {
    const today =
        new Date();

    const yesterday =
        addDays(
            today,
            -1
        );

    const previousYearComparableDate =
        getPreviousYearComparableDate(
            today
        );

    const todayId =
        dateToId(today);

    const yesterdayId =
        dateToId(yesterday);

    const previousYearId =
        dateToId(
            previousYearComparableDate
        );

    document.getElementById(
        "dashboardDate"
    ).textContent =
        todayId;

    const [
        todayRow,
        yesterdayRow,
        previousYearRow
    ] = await Promise.all([
        getDocumentRow(
            "shippingProgress",
            todayId
        ),

        getDocumentRow(
            "shippingDaily",
            yesterdayId
        ),

        getDocumentRow(
            "shippingDaily",
            previousYearId
        )
    ]);

    if (!active) {
        return;
    }

    if (!todayRow) {
        document.getElementById(
            "dashboardStatus"
        ).textContent =
            "오늘 작업현황 데이터가 없습니다.";

        return;
    }

    renderDashboardRow(
        todayRow,
        todayId
    );

    renderComparisonCharts(
        todayRow,
        yesterdayRow,
        previousYearRow,
        yesterdayId,
        previousYearId
    );
}

export async function mount({
    content,
    actions
}) {
    active = true;

    actions.innerHTML = "";

    content.innerHTML =
        createDashboardMarkup();

    const instructorSalesMonth =
        document.getElementById(
            "instructorSalesMonth"
        );

    instructorSalesMonth.value =
        getCurrentMonthId();

    document
        .getElementById(
            "instructorSalesSearchButton"
        )
        .addEventListener(
            "click",
            searchInstructorSalesComparison
        );

    document
        .getElementById(
            "instructorTrendSearchButton"
        )
        .addEventListener(
            "click",
            searchInstructorSalesTrend
        );

    document
        .getElementById(
            "instructorNameSearch"
        )
        .addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    searchInstructorSalesTrend();
                }
            }
        );

    if (
        typeof Chart === "undefined"
    ) {
        document.getElementById(
            "dashboardStatus"
        ).textContent =
            "Chart.js를 불러오지 못했습니다.";

        return;
    }

    try {
        const [
            dashboardResult,
            instructorResult
        ] = await Promise.allSettled([
            loadDashboardData(),
            loadInstructorSalesComparison(
                instructorSalesMonth.value
            )
        ]);

        if (
            dashboardResult.status ===
            "rejected"
        ) {
            throw dashboardResult.reason;
        }

        if (
            instructorResult.status ===
            "rejected"
        ) {
            console.error(
                "[instructorSalesComparison]",
                instructorResult.reason
            );

            if (active) {
                const status =
                    document.getElementById(
                        "instructorSalesStatus"
                    );

                status.classList.add("error");
                status.textContent =
                    "강사별 매출 비교자료를 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
            }
        }
    } catch (error) {
        console.error(
            "[dashboard]",
            error
        );

        if (!active) {
            return;
        }

        document.getElementById(
            "dashboardStatus"
        ).textContent =
            "대시보드 데이터를 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
    destroyCharts();
}
