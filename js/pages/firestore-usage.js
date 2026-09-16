// /js/pages/firestore-usage.js

import {
    getCollectionRowsByDocumentIdRange
} from "../services/firestore-service.js";
import {
    formatNumber,
    getNumber
} from "../utils/number-utils.js";

export const title = "Firestore 사용량";

const COLLECTION_NAME = "firestore_usage_daily";
let selectedDays = 1;

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getRange(days) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    return {
        start: formatDate(start),
        end: formatDate(end)
    };
}

function timestampText(value) {
    if (!value) {
        return "-";
    }

    const date = typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function aggregateRows(rows) {
    const map = new Map();

    rows.forEach((row) => {
        const uid = String(row.uid || row.id || "");
        const email = String(row.email || "-");
        const key = uid || email;

        if (!map.has(key)) {
            map.set(key, {
                uid,
                email,
                session_count: 0,
                dashboard_reads: 0,
                shipping_statistics_reads: 0,
                instructor_sales_reads: 0,
                monthly_statistics_reads: 0,
                firestore_usage_reads: 0,
                auth_reads: 0,
                other_reads: 0,
                total_reads: 0,
                last_synced_at: null
            });
        }

        const target = map.get(key);
        [
            "session_count",
            "dashboard_reads",
            "shipping_statistics_reads",
            "instructor_sales_reads",
            "monthly_statistics_reads",
            "firestore_usage_reads",
            "auth_reads",
            "other_reads",
            "total_reads"
        ].forEach((field) => {
            target[field] += getNumber(row[field]);
        });

        const currentTime = row.last_synced_at?.toMillis?.() || 0;
        const previousTime = target.last_synced_at?.toMillis?.() || 0;
        if (currentTime >= previousTime) {
            target.last_synced_at = row.last_synced_at || target.last_synced_at;
        }
    });

    return [...map.values()].sort(
        (a, b) => b.total_reads - a.total_reads
    );
}

function sumRows(rows) {
    return rows.reduce(
        (sum, row) => sum + getNumber(row.total_reads),
        0
    );
}

function renderSummary(content, rows, range) {
    const userCount = rows.length;
    const totalReads = sumRows(rows);
    const totalSessions = rows.reduce(
        (sum, row) => sum + getNumber(row.session_count),
        0
    );

    const summary = content.querySelector("#usageSummary");
    summary.innerHTML = `
        <div class="usage-summary-card">
            <span>조회기간</span>
            <strong>${range.start} ~ ${range.end}</strong>
        </div>
        <div class="usage-summary-card">
            <span>사용자</span>
            <strong>${formatNumber(userCount)}</strong>
        </div>
        <div class="usage-summary-card">
            <span>접속 세션</span>
            <strong>${formatNumber(totalSessions)}</strong>
        </div>
        <div class="usage-summary-card">
            <span>추적 Read 합계</span>
            <strong>${formatNumber(totalReads)}</strong>
        </div>
    `;
}

function renderTable(content, rows) {
    const body = content.querySelector("#usageTableBody");

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="10" class="usage-empty">기록된 사용량이 없습니다.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map((row) => `
        <tr>
            <td class="usage-user-cell">
                <strong>${row.email || "-"}</strong>
                <span>${row.uid || "-"}</span>
            </td>
            <td>${formatNumber(row.session_count)}</td>
            <td>${formatNumber(row.dashboard_reads)}</td>
            <td>${formatNumber(row.shipping_statistics_reads)}</td>
            <td>${formatNumber(row.instructor_sales_reads)}</td>
            <td>${formatNumber(row.monthly_statistics_reads)}</td>
            <td>${formatNumber(row.firestore_usage_reads)}</td>
            <td>${formatNumber(row.auth_reads + row.other_reads)}</td>
            <td class="usage-total-cell">${formatNumber(row.total_reads)}</td>
            <td>${timestampText(row.last_synced_at)}</td>
        </tr>
    `).join("");
}

async function loadUsage(content) {
    const status = content.querySelector("#usageStatus");
    const range = getRange(selectedDays);

    status.classList.remove("error");
    status.textContent = "사용량을 불러오는 중입니다.";

    try {
        const rows = await getCollectionRowsByDocumentIdRange(
            COLLECTION_NAME,
            `${range.start}_`,
            `${range.end}_\uf8ff`
        );

        const aggregated = aggregateRows(rows);
        renderSummary(content, aggregated, range);
        renderTable(content, aggregated);

        status.textContent = `총 ${formatNumber(rows.length)}개의 일별 기록을 조회했습니다.`;
    } catch (error) {
        console.error("[firestore-usage]", error);
        status.classList.add("error");
        status.textContent = "사용량 기록을 불러오지 못했습니다.";
    }
}

function bindRangeButtons(content) {
    content.querySelectorAll("[data-usage-days]").forEach((button) => {
        button.addEventListener("click", async () => {
            selectedDays = Number(button.dataset.usageDays) || 1;

            content.querySelectorAll("[data-usage-days]").forEach((item) => {
                item.classList.toggle(
                    "is-active",
                    item === button
                );
            });

            await loadUsage(content);
        });
    });
}

export async function mount({ content }) {
    selectedDays = 1;

    content.innerHTML = `
        <section class="usage-page">
            <div class="usage-toolbar">
                <div class="usage-range-buttons">
                    <button class="btn usage-range-button is-active" type="button" data-usage-days="1">오늘</button>
                    <button class="btn usage-range-button" type="button" data-usage-days="7">최근 7일</button>
                    <button class="btn usage-range-button" type="button" data-usage-days="30">최근 30일</button>
                </div>
                <p id="usageStatus" class="period-status"></p>
            </div>

            <div id="usageSummary" class="usage-summary-grid"></div>

            <div class="usage-table-card">
                <div class="usage-table-wrap">
                    <table class="usage-table">
                        <thead>
                            <tr>
                                <th>사용자</th>
                                <th>세션</th>
                                <th>Dashboard</th>
                                <th>발송 통계</th>
                                <th>강사 매출</th>
                                <th>월별 통계</th>
                                <th>사용량 관리</th>
                                <th>인증/기타</th>
                                <th>총 Read</th>
                                <th>마지막 기록</th>
                            </tr>
                        </thead>
                        <tbody id="usageTableBody"></tbody>
                    </table>
                </div>
            </div>

            <p class="usage-note">
                이 화면의 수치는 웹앱이 자체 추적한 예상 Firestore 문서 Read 수입니다. Firebase 콘솔의 공식 청구 수치와는 보안 규칙 조회, 인덱스 읽기 등으로 차이가 있을 수 있습니다.
            </p>
        </section>
    `;

    bindRangeButtons(content);
    await loadUsage(content);
}

export function unmount() {
}
