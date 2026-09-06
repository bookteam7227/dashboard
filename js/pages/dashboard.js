// /js/pages/dashboard.js

import { getDocumentRow } from "../services/firestore-service.js";
import { addDays, dateToId } from "../utils/date-utils.js";
import { getNumber } from "../utils/number-utils.js";

export const title = "Dashboard";

let active = false;
let lectureChart = null;
let bookstoreChart = null;
let unistudyChart = null;

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
        unistudyChart
    ].forEach((chart) => {
        chart?.destroy();
    });

    lectureChart = null;
    bookstoreChart = null;
    unistudyChart = null;
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
        candidateIso.isoYear ===
            targetIsoYear
        && candidateIso.week ===
            currentIso.week
        && candidateIso.weekday ===
            currentIso.weekday
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
                </div>
            `;
        }
    ).join("");
}

function createDashboardMarkup() {
    return `
        <section class="dashboard-date-card">
            <span class="dashboard-date-label">
                기준일자:
            </span>

            <strong
                id="dashboardDate"
                class="dashboard-date-value"
            >
                -
            </strong>
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
                    </div>
                </div>
            </article>

            <article class="dashboard-card local-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>로컬 상태</h2>
                        <p>
                            인강 로컬 1~9 작업 상태
                        </p>
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
                        <h2>
                            온라인서점/유니스터디
                        </h2>

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
            getLocalStatus(
                localRow
            );

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
            const {
                ctx
            } = chart;

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
        await loadDashboardData();
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
