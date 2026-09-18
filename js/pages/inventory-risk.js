// /js/pages/inventory-risk.js

import {
    getCollectionRows,
    getDocumentRow
} from "../services/firestore-service.js";
import { getNumber } from "../utils/number-utils.js";

export const title = "교재 재고 현황";

const COLLECTION_NAME = "inventoryRisk";
const META_COLLECTION_NAME = "dashboard_meta";
const META_DOCUMENT_ID = "inventory-risk";

let active = false;
let cachedRows = [];
let cachedVersion = null;

function formatNumber(value) {
    return getNumber(value).toLocaleString("ko-KR");
}

function formatAvailableDays(value) {
    if (
        value === null
        || value === undefined
        || value === ""
    ) {
        return "-";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "-";
    }

    return `${number.toLocaleString("ko-KR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })}일`;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function escapeHtml(value) {
    return normalizeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function riskLabels(row) {
    const labels = [];

    if (Number(row.is_stockout_risk) === 1) {
        labels.push("품절 위험");
    }

    if (Number(row.is_overstock) === 1) {
        labels.push("과다 재고");
    }

    if (Number(row.is_long_term) === 1) {
        labels.push("장기 재고");
    }

    return labels;
}

function matchesRiskType(row, riskType) {
    switch (riskType) {
        case "stockout":
            return Number(row.is_stockout_risk) === 1;

        case "overstock":
            return Number(row.is_overstock) === 1;

        case "long-term":
            return Number(row.is_long_term) === 1;

        default:
            return true;
    }
}

function uniqueSortedValues(rows, fieldName) {
    return Array.from(
        new Set(
            rows
                .map((row) => normalizeText(row[fieldName]))
                .filter(Boolean)
        )
    ).sort((a, b) =>
        a.localeCompare(
            b,
            "ko-KR",
            {
                numeric: true
            }
        )
    );
}

function optionMarkup(value) {
    const safeValue = escapeHtml(value);

    return `
        <option value="${safeValue}">
            ${safeValue}
        </option>
    `;
}

function populateSelect(
    elementId,
    rows,
    fieldName,
    defaultText
) {
    const select =
        document.getElementById(elementId);

    if (!select) {
        return;
    }

    const values =
        uniqueSortedValues(
            rows,
            fieldName
        );

    select.innerHTML = [
        `<option value="">${defaultText}</option>`,
        ...values.map(optionMarkup)
    ].join("");
}

function renderSummary(rows) {
    const totalCount =
        rows.length;

    const stockoutCount =
        rows.filter(
            (row) =>
                Number(
                    row.is_stockout_risk
                ) === 1
        ).length;

    const overstockCount =
        rows.filter(
            (row) =>
                Number(
                    row.is_overstock
                ) === 1
        ).length;

    const longTermCount =
        rows.filter(
            (row) =>
                Number(
                    row.is_long_term
                ) === 1
        ).length;

    document.getElementById(
        "inventoryRiskTotalCount"
    ).textContent =
        `${formatNumber(totalCount)}종`;

    document.getElementById(
        "inventoryRiskStockoutCount"
    ).textContent =
        `${formatNumber(stockoutCount)}종`;

    document.getElementById(
        "inventoryRiskOverstockCount"
    ).textContent =
        `${formatNumber(overstockCount)}종`;

    document.getElementById(
        "inventoryRiskLongTermCount"
    ).textContent =
        `${formatNumber(longTermCount)}종`;
}

function riskBadgeMarkup(row) {
    const labels =
        riskLabels(row);

    if (!labels.length) {
        return "-";
    }

    return labels
        .map((label) => {
            let className =
                "inventory-risk-badge";

            if (label === "품절 위험") {
                className +=
                    " is-stockout";
            } else if (
                label === "과다 재고"
            ) {
                className +=
                    " is-overstock";
            } else if (
                label === "장기 재고"
            ) {
                className +=
                    " is-long-term";
            }

            return `
                <span class="${className}">
                    ${label}
                </span>
            `;
        })
        .join("");
}

function renderTable(rows) {
    const tbody =
        document.getElementById(
            "inventoryRiskTableBody"
        );

    const resultCount =
        document.getElementById(
            "inventoryRiskResultCount"
        );

    if (!tbody || !resultCount) {
        return;
    }

    resultCount.textContent =
        `${formatNumber(rows.length)}종`;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td
                    class="inventory-risk-empty"
                    colspan="12"
                >
                    검색 조건에 해당하는 교재가 없습니다.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML =
        rows.map((row) => `
            <tr>
                <td>
                    ${escapeHtml(row.book_code)}
                </td>

                <td>
                    ${escapeHtml(row.barcode)}
                </td>

                <td>
                    ${escapeHtml(row.instructor_name)}
                </td>

                <td class="inventory-risk-book-name">
                    ${escapeHtml(row.book_name)}
                </td>

                <td>
                    ${escapeHtml(row.vendor_name)}
                </td>

                <td class="inventory-risk-number">
                    ${formatNumber(row.stock_before)}
                </td>

                <td class="inventory-risk-number">
                    ${formatNumber(row.defective_qty)}
                </td>

                <td class="inventory-risk-number">
                    ${formatNumber(row.dispatch_qty)}
                </td>

                <td class="inventory-risk-number">
                    ${formatNumber(row.external_stock)}
                </td>

                <td class="inventory-risk-number">
                    ${formatNumber(row.available_stock)}
                </td>

                <td class="inventory-risk-number">
                    ${formatAvailableDays(row.available_days)}
                </td>

                <td class="inventory-risk-type-cell">
                    ${riskBadgeMarkup(row)}
                </td>
            </tr>
        `).join("");
}

function selectedValue(elementId) {
    return normalizeText(
        document.getElementById(
            elementId
        )?.value
    );
}

function applyFilters() {
    const riskType =
        selectedValue(
            "inventoryRiskTypeSelect"
        );

    const instructorName =
        selectedValue(
            "inventoryRiskInstructorSelect"
        );

    const vendorName =
        selectedValue(
            "inventoryRiskVendorSelect"
        );

    const bookName =
        selectedValue(
            "inventoryRiskBookSelect"
        );

    const filteredRows =
        cachedRows.filter((row) => {
            if (
                !matchesRiskType(
                    row,
                    riskType
                )
            ) {
                return false;
            }

            if (
                instructorName
                && normalizeText(
                    row.instructor_name
                ) !== instructorName
            ) {
                return false;
            }

            if (
                vendorName
                && normalizeText(
                    row.vendor_name
                ) !== vendorName
            ) {
                return false;
            }

            if (
                bookName
                && normalizeText(
                    row.book_name
                ) !== bookName
            ) {
                return false;
            }

            return true;
        });

    renderTable(filteredRows);
}

function resetFilters() {
    [
        "inventoryRiskTypeSelect",
        "inventoryRiskInstructorSelect",
        "inventoryRiskVendorSelect",
        "inventoryRiskBookSelect"
    ].forEach((elementId) => {
        const element =
            document.getElementById(
                elementId
            );

        if (element) {
            element.value = "";
        }
    });

    renderTable(cachedRows);
}

function bindEvents() {
    document
        .getElementById(
            "inventoryRiskSearchButton"
        )
        ?.addEventListener(
            "click",
            applyFilters
        );

    document
        .getElementById(
            "inventoryRiskResetButton"
        )
        ?.addEventListener(
            "click",
            resetFilters
        );
}

function populateFilters(rows) {
    populateSelect(
        "inventoryRiskInstructorSelect",
        rows,
        "instructor_name",
        "전체 강사"
    );

    populateSelect(
        "inventoryRiskVendorSelect",
        rows,
        "vendor_name",
        "전체 거래처"
    );

    populateSelect(
        "inventoryRiskBookSelect",
        rows,
        "book_name",
        "전체 교재"
    );
}

function sortRows(rows) {
    return [...rows].sort(
        (a, b) => {
            const aStockout =
                Number(
                    a.is_stockout_risk
                );

            const bStockout =
                Number(
                    b.is_stockout_risk
                );

            if (
                aStockout
                !== bStockout
            ) {
                return (
                    bStockout
                    - aStockout
                );
            }

            const aDays =
                Number(
                    a.available_days
                );

            const bDays =
                Number(
                    b.available_days
                );

            const safeADays =
                Number.isFinite(aDays)
                    ? aDays
                    : Number.MAX_SAFE_INTEGER;

            const safeBDays =
                Number.isFinite(bDays)
                    ? bDays
                    : Number.MAX_SAFE_INTEGER;

            if (
                safeADays
                !== safeBDays
            ) {
                return (
                    safeADays
                    - safeBDays
                );
            }

            return normalizeText(
                a.book_name
            ).localeCompare(
                normalizeText(
                    b.book_name
                ),
                "ko-KR",
                {
                    numeric: true
                }
            );
        }
    );
}

async function loadRows() {
    const status =
        document.getElementById(
            "inventoryRiskStatus"
        );

    status.classList.remove(
        "error"
    );

    status.textContent =
        "교재 재고 현황을 불러오고 있습니다.";

    const meta =
        await getDocumentRow(
            META_COLLECTION_NAME,
            META_DOCUMENT_ID
        );

    if (!active) {
        return;
    }

    const currentVersion =
        normalizeText(
            meta?.version
            || meta?.updated_at
        );

    if (
        cachedRows.length > 0
        && cachedVersion
        && currentVersion
        && cachedVersion
            === currentVersion
    ) {
        renderSummary(cachedRows);
        populateFilters(cachedRows);
        renderTable(cachedRows);

        status.textContent =
            `최종 업데이트: ${
                normalizeText(
                    meta?.updated_at
                )
                || "-"
            } · 캐시 사용`;

        return;
    }

    const rows =
        await getCollectionRows(
            COLLECTION_NAME
        );

    if (!active) {
        return;
    }

    cachedRows =
        sortRows(rows);

    cachedVersion =
        currentVersion;

    renderSummary(cachedRows);
    populateFilters(cachedRows);
    renderTable(cachedRows);

    status.textContent =
        `최종 업데이트: ${
            normalizeText(
                meta?.updated_at
            )
            || "-"
        }`;
}

function createMarkup() {
    return `
        <section
            class="inventory-risk-status-row"
        >
            <p
                id="inventoryRiskStatus"
                class="period-status"
            >
                교재 재고 현황을 불러오고 있습니다.
            </p>
        </section>

        <section
            class="inventory-risk-summary-grid"
        >
            <article
                class="inventory-risk-summary-card"
            >
                <span
                    class="inventory-risk-summary-label"
                >
                    전체 위험 교재
                </span>

                <strong
                    id="inventoryRiskTotalCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p
                    class="inventory-risk-summary-description"
                >
                    품절·과다·장기 재고 중
                    하나 이상에 해당하는 교재
                </p>
            </article>

            <article
                class="inventory-risk-summary-card"
            >
                <span
                    class="inventory-risk-summary-label"
                >
                    품절 위험
                </span>

                <strong
                    id="inventoryRiskStockoutCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p
                    class="inventory-risk-summary-description"
                >
                    현우진 31일 이하 ·
                    그 외 강사 16일 이하
                </p>
            </article>

            <article
                class="inventory-risk-summary-card"
            >
                <span
                    class="inventory-risk-summary-label"
                >
                    과다 재고
                </span>

                <strong
                    id="inventoryRiskOverstockCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p
                    class="inventory-risk-summary-description"
                >
                    금일 출고량 기준
                    출고가능일 90일 초과
                </p>
            </article>

            <article
                class="inventory-risk-summary-card"
            >
                <span
                    class="inventory-risk-summary-label"
                >
                    장기 재고
                </span>

                <strong
                    id="inventoryRiskLongTermCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p
                    class="inventory-risk-summary-description"
                >
                    출간일이 기준일로부터
                    2년 이상 경과한 교재
                </p>
            </article>
        </section>

        <section
            class="inventory-risk-filter-row"
        >
            <div
                class="inventory-risk-filter-group"
            >
                <select
                    id="inventoryRiskTypeSelect"
                    aria-label="구분"
                >
                    <option value="">
                        전체 구분
                    </option>

                    <option value="stockout">
                        품절 위험
                    </option>

                    <option value="overstock">
                        과다 재고
                    </option>

                    <option value="long-term">
                        장기 재고
                    </option>
                </select>

                <select
                    id="inventoryRiskInstructorSelect"
                    aria-label="강사명"
                >
                    <option value="">
                        전체 강사
                    </option>
                </select>

                <select
                    id="inventoryRiskVendorSelect"
                    aria-label="거래처명"
                >
                    <option value="">
                        전체 거래처
                    </option>
                </select>

                <select
                    id="inventoryRiskBookSelect"
                    aria-label="교재명"
                >
                    <option value="">
                        전체 교재
                    </option>
                </select>

                <button
                    id="inventoryRiskSearchButton"
                    class="btn primary"
                    type="button"
                >
                    검색
                </button>

                <button
                    id="inventoryRiskResetButton"
                    class="btn inventory-risk-reset-button"
                    type="button"
                >
                    초기화
                </button>
            </div>
        </section>

        <section
            class="dashboard-card inventory-risk-table-card"
        >
            <div
                class="dashboard-card-header inventory-risk-table-header"
            >
                <div>
                    <h2>
                        교재 재고 상세
                    </h2>

                    <p>
                        현재 위험 조건에 해당하는
                        교재만 표시됩니다.
                    </p>
                </div>

                <strong
                    id="inventoryRiskResultCount"
                    class="inventory-risk-result-count"
                >
                    0종
                </strong>
            </div>

            <div
                class="inventory-risk-table-wrap"
            >
                <table
                    class="inventory-risk-table"
                >
                    <thead>
                        <tr>
                            <th>교재코드</th>
                            <th>바코드</th>
                            <th>강사명</th>
                            <th>교재명</th>
                            <th>거래처</th>
                            <th>출고전재고</th>
                            <th>파본</th>
                            <th>금일 출고</th>
                            <th>외부창고</th>
                            <th>출고후재고</th>
                            <th>출고가능일</th>
                            <th>구분</th>
                        </tr>
                    </thead>

                    <tbody
                        id="inventoryRiskTableBody"
                    ></tbody>
                </table>
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
    content.innerHTML =
        createMarkup();

    bindEvents();

    try {
        await loadRows();
    } catch (error) {
        console.error(
            "[inventoryRisk]",
            error
        );

        if (!active) {
            return;
        }

        const status =
            document.getElementById(
                "inventoryRiskStatus"
            );

        status.classList.add(
            "error"
        );

        status.textContent =
            "교재 재고 현황을 불러오지 못했습니다. Firestore 읽기 권한과 컬렉션을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
}
