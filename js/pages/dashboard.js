// /js/pages/dashboard.js

import { getCollectionRows } from "../services/firestore-service.js";
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
        <section class="dashboard-summary">
            <article class="dashboard-panel attendance-panel">
                <div class="dashboard-panel-head">
                    <h2>출근 현황</h2>
                    <p id="dashboardDate" class="dashboard-panel-sub">오늘 기준</p>
                </div>

                <div class="attendance-grid">
                    <div class="attendance-item">
                        <span class="attendance-label">직원</span>
                        <strong id="employeeCount" class="attendance-value">0명</strong>
                    </div>

                    <div class="attendance-item">
                        <span class="attendance-label">아르바이트</span>
                        <strong id="partTimeCount" class="attendance-value">0명</strong>
                    </div>
                </div>
            </article>

            <article class="dashboard-panel work-panel">
                <div class="dashboard-panel-head">
                    <h2>작업 현황</h2>
                    <p id="dashboardStatus" class="dashboard-panel-sub">
                        오늘 작업현황을 불러오고 있습니다.
                    </p>
                </div>

                <div class="work-status-grid">
                    <section class="work-status-item">
                        <h3>인강</h3>

                        <div class="work-metric-row">
                            <span>건수</span>
                            <strong id="lectureOrders">0건</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>권수</span>
                            <strong id="lectureBooks">0권</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>진행률</span>
                            <strong id="lectureProgress">건 0.0% / 권 0.0%</strong>
                        </div>
                    </section>

                    <section class="work-status-item">
                        <h3>온라인서점</h3>

                        <div class="work-metric-row">
                            <span>건수</span>
                            <strong id="bookstoreOrders">0건</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>권수</span>
                            <strong id="bookstoreBooks">0권</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>진행률</span>
                            <strong>0.0%</strong>
                        </div>
                    </section>

                    <section class="work-status-item">
                        <h3>유니스터디</h3>

                        <div class="work-metric-row">
                            <span>건수</span>
                            <strong id="unistudyOrders">0건</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>권수</span>
                            <strong id="unistudyBooks">0권</strong>
                        </div>

                        <div class="work-metric-row">
                            <span>진행률</span>
                            <strong>0.0%</strong>
                        </div>
                    </section>
                </div>
            </article>
        </section>
    `;
}

function renderDashboardRow(row, todayId) {
    const attendance = row?.attendance || {};

    document.getElementById("dashboardDate").textContent = `${todayId} 기준`;

    document.getElementById("employeeCount").textContent =
        `${formatNumber(attendance.employee_count)}명`;

    document.getElementById("partTimeCount").textContent =
        `${formatNumber(attendance.part_time_count)}명`;

    document.getElementById("lectureOrders").textContent =
        `${formatNumber(row.total_orders)}건`;

    document.getElementById("lectureBooks").textContent =
        `${formatNumber(row.total_books)}권`;

    document.getElementById("lectureProgress").textContent =
        `건 ${formatRate(row.order_progress_rate)} / 권 ${formatRate(row.book_progress_rate)}`;

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
    const rows = await getCollectionRows("shippingProgress");

    if (!active) {
        return;
    }

    const todayRow = rows.find((row) => {
        const dateId = String(row.work_date || row.id || "");
        return dateId === todayId;
    });

    if (!todayRow) {
        document.getElementById("dashboardDate").textContent = `${todayId} 기준`;
        document.getElementById("dashboardStatus").textContent =
            "오늘 작업현황 데이터가 없습니다.";
        return;
    }

    renderDashboardRow(todayRow, todayId);
}

export async function mount({ content, actions }) {
    active = true;
    actions.innerHTML = "";
    content.innerHTML = createDashboardMarkup();

    try {
        await loadDashboardData();
    } catch (error) {
        console.error("[shippingProgress]", error);

        if (!active) {
            return;
        }

        const status = document.getElementById("dashboardStatus");
        status.textContent =
            "작업현황을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
}
