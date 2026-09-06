// /js/pages/dashboard.js

import { getDocumentRow } from "../services/firestore-service.js";
import { dateToId } from "../utils/date-utils.js";
import { getNumber } from "../utils/number-utils.js";

export const title = "Dashboard";

let active = false;

function formatNumber(value) {
    return getNumber(value).toLocaleString("ko-KR");
}

function formatRate(value) {
    return `${getNumber(value).toFixed(1)}%`;
}

function createDashboardMarkup() {
    return `
        <section class="dashboard-date-card">
            <span class="dashboard-date-label">기준일자:</span>
            <strong id="dashboardDate" class="dashboard-date-value">-</strong>
        </section>

        <section class="dashboard-main-grid">
            <article class="dashboard-card attendance-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>출근 현황</h2>
                        <p>오늘 출근 인원</p>
                    </div>
                </div>

                <div class="attendance-card-grid">
                    <div class="attendance-stat-card">
                        <span class="attendance-stat-label">직원</span>
                        <strong
                            id="employeeCount"
                            class="attendance-stat-value"
                        >
                            0명
                        </strong>
                    </div>

                    <div class="attendance-stat-card">
                        <span class="attendance-stat-label">아르바이트</span>
                        <strong
                            id="partTimeCount"
                            class="attendance-stat-value"
                        >
                            0명
                        </strong>
                    </div>
                </div>
            </article>

            <article class="dashboard-card work-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>작업 현황</h2>
                        <p id="dashboardStatus">
                            오늘 작업현황을 불러오고 있습니다.
                        </p>
                    </div>
                </div>

                <div class="work-card-grid">
                    <section class="work-detail-card">
                        <div class="work-detail-title">인강</div>

                        <div class="work-table">
                            <div class="work-table-row work-table-header">
                                <span>구분</span>
                                <span>전체</span>
                                <span>처리</span>
                                <span>진행률</span>
                            </div>

                            <div class="work-table-row">
                                <span>건수</span>
                                <strong id="lectureTotalOrders">0건</strong>
                                <strong id="lectureCompletedOrders">0건</strong>
                                <strong id="lectureOrderProgress">0.0%</strong>
                            </div>

                            <div class="work-table-row">
                                <span>권수</span>
                                <strong id="lectureTotalBooks">0권</strong>
                                <strong id="lectureCompletedBooks">0권</strong>
                                <strong id="lectureBookProgress">0.0%</strong>
                            </div>
                        </div>
                    </section>

                    <section class="work-detail-card">
                        <div class="work-detail-title">
                            온라인서점/유니스터디
                        </div>

                        <div class="work-table work-table-three-column">
                            <div class="work-table-row work-table-header">
                                <span>구분</span>
                                <span>건수</span>
                                <span>권수</span>
                            </div>

                            <div class="work-table-row">
                                <span>온라인서점</span>
                                <strong id="bookstoreOrders">0건</strong>
                                <strong id="bookstoreBooks">0권</strong>
                            </div>

                            <div class="work-table-row">
                                <span>유니스터디</span>
                                <strong id="unistudyOrders">0건</strong>
                                <strong id="unistudyBooks">0권</strong>
                            </div>
                        </div>
                    </section>
                </div>
            </article>
        </section>
    `;
}

function renderDashboardRow(row, todayId) {
    const attendance = row?.attendance || {};

    document.getElementById("dashboardDate").textContent =
        todayId;

    document.getElementById("employeeCount").textContent =
        `${formatNumber(attendance.employee_count)}명`;

    document.getElementById("partTimeCount").textContent =
        `${formatNumber(attendance.part_time_count)}명`;

    document.getElementById("lectureTotalOrders").textContent =
        `${formatNumber(row.total_orders)}건`;

    document.getElementById("lectureCompletedOrders").textContent =
        `${formatNumber(row.completed_orders)}건`;

    document.getElementById("lectureOrderProgress").textContent =
        formatRate(row.order_progress_rate);

    document.getElementById("lectureTotalBooks").textContent =
        `${formatNumber(row.total_books)}권`;

    document.getElementById("lectureCompletedBooks").textContent =
        `${formatNumber(row.completed_books)}권`;

    document.getElementById("lectureBookProgress").textContent =
        formatRate(row.book_progress_rate);

    document.getElementById("bookstoreOrders").textContent =
        `${formatNumber(row.bookstore_orders)}건`;

    document.getElementById("bookstoreBooks").textContent =
        `${formatNumber(row.bookstore_books)}권`;

    document.getElementById("unistudyOrders").textContent =
        `${formatNumber(row.unistudy_orders)}건`;

    document.getElementById("unistudyBooks").textContent =
        `${formatNumber(row.unistudy_books)}권`;

    document.getElementById("dashboardStatus").textContent =
        "오늘 작업현황";
}

async function loadDashboardData() {
    const todayId = dateToId(new Date());

    document.getElementById(
        "dashboardDate"
    ).textContent = todayId;

    const todayRow = await getDocumentRow(
        "shippingProgress",
        todayId
    );

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
}

export async function mount({
    content,
    actions
}) {
    active = true;

    actions.innerHTML = "";
    content.innerHTML =
        createDashboardMarkup();

    try {
        await loadDashboardData();
    } catch (error) {
        console.error(
            "[shippingProgress]",
            error
        );

        if (!active) {
            return;
        }

        document.getElementById(
            "dashboardStatus"
        ).textContent =
            "작업현황을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
}
