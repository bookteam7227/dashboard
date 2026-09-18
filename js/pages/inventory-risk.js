// /js/pages/inventory-risk.js

import {
    getDocumentRow
} from "../services/firestore-service.js";
import { getNumber } from "../utils/number-utils.js";

export const title = "교재 재고 현황";

const SNAPSHOT_COLLECTION_NAME = "inventoryRiskSnapshot";
const META_COLLECTION_NAME = "dashboard_meta";
const META_DOCUMENT_ID = "inventory-risk";

const CACHE_KEY = "dashboard.inventoryRisk.v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let active = false;
let rows = [];
let currentMeta = null;

let currentSortKey = "";
let currentSortDirection = "asc";

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
        maximumFractionDigits: 1
    })}일`;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeSearchText(value) {
    return normalizeText(value)
        .toLocaleLowerCase("ko-KR");
}

function escapeHtml(value) {
    return normalizeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getRiskLabels(row) {
    const result = [];

    if (row.is_stockout_risk === true) {
        result.push("품절 위험");
    }

    if (row.is_overstock === true) {
        result.push("과다 재고");
    }

    if (row.is_long_term === true) {
        result.push("장기 재고");
    }

    if (getNumber(row.stock_before) <= 0) {
        result.push("재고 소진");
    }

    return result;
}

function isRiskMatch(row, riskType) {
    if (riskType === "stockout") {
        return row.is_stockout_risk === true;
    }

    if (riskType === "overstock") {
        return row.is_overstock === true;
    }

    if (riskType === "long-term") {
        return row.is_long_term === true;
    }

    if (riskType === "depleted") {
        return getNumber(
            row.stock_before
        ) <= 0;
    }

    return true;
}

function getSearchFieldName(fieldType) {
    if (fieldType === "vendor") {
        return "vendor_name";
    }

    if (fieldType === "book") {
        return "book_name";
    }

    return "instructor_name";
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        if (
            !parsed
            || !Array.isArray(parsed.rows)
            || typeof parsed.savedAt !== "number"
        ) {
            return null;
        }

        return parsed;
    } catch (error) {
        console.error(
            "[inventoryRisk:readCache]",
            error
        );

        return null;
    }
}

function writeCache(version, dataRows) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                version: normalizeText(version),
                savedAt: Date.now(),
                rows: dataRows
            })
        );
    } catch (error) {
        console.error(
            "[inventoryRisk:writeCache]",
            error
        );
    }
}

function isCacheFresh(cache) {
    if (!cache) {
        return false;
    }

    return (
        Date.now() - cache.savedAt
        < CACHE_TTL_MS
    );
}

function getMetaVersion(meta) {
    return normalizeText(
        meta?.version
        || meta?.updated_at
    );
}

function compareText(a, b) {
    return normalizeText(a).localeCompare(
        normalizeText(b),
        "ko-KR",
        {
            numeric: true,
            sensitivity: "base"
        }
    );
}

function compareNumber(a, b) {
    const aNumber = Number(a);
    const bNumber = Number(b);

    const aValid = Number.isFinite(aNumber);
    const bValid = Number.isFinite(bNumber);

    if (!aValid && !bValid) {
        return 0;
    }

    if (!aValid) {
        return 1;
    }

    if (!bValid) {
        return -1;
    }

    return aNumber - bNumber;
}

function getRiskSortText(row) {
    return getRiskLabels(row).join(" / ");
}

function defaultSortRows(dataRows) {
    return [...dataRows].sort((a, b) => {
        const vendorCompare = compareText(
            a.vendor_name,
            b.vendor_name
        );

        if (vendorCompare !== 0) {
            return vendorCompare;
        }

        const daysCompare = compareNumber(
            a.available_days,
            b.available_days
        );

        if (daysCompare !== 0) {
            return daysCompare;
        }

        return compareText(
            a.book_code,
            b.book_code
        );
    });
}

function sortRowsByColumn(
    dataRows,
    sortKey,
    direction
) {
    if (!sortKey) {
        return defaultSortRows(
            dataRows
        );
    }

    const multiplier =
        direction === "desc"
            ? -1
            : 1;

    return [...dataRows].sort((a, b) => {
        let result = 0;

        if (sortKey === "book_code") {
            result = compareText(
                a.book_code,
                b.book_code
            );
        } else if (sortKey === "barcode") {
            result = compareText(
                a.barcode,
                b.barcode
            );
        } else if (
            sortKey === "instructor_name"
        ) {
            result = compareText(
                a.instructor_name,
                b.instructor_name
            );
        } else if (sortKey === "book_name") {
            result = compareText(
                a.book_name,
                b.book_name
            );
        } else if (sortKey === "vendor_name") {
            result = compareText(
                a.vendor_name,
                b.vendor_name
            );
        } else if (
            sortKey === "stock_before"
            || sortKey === "defective_qty"
            || sortKey === "dispatch_qty"
            || sortKey === "external_stock"
            || sortKey === "available_stock"
            || sortKey === "available_days"
        ) {
            result = compareNumber(
                a[sortKey],
                b[sortKey]
            );
        } else if (sortKey === "risk") {
            result = compareText(
                getRiskSortText(a),
                getRiskSortText(b)
            );
        }

        if (result !== 0) {
            return result * multiplier;
        }

        return compareText(
            a.book_code,
            b.book_code
        );
    });
}

function updateSortHeaderState() {
    document
        .querySelectorAll(
            ".inventory-risk-sort-button"
        )
        .forEach((button) => {
            const sortKey =
                normalizeText(
                    button.dataset.sortKey
                );

            const isActive =
                sortKey === currentSortKey;

            button.classList.toggle(
                "is-active",
                isActive
            );

            button.dataset.direction =
                isActive
                    ? currentSortDirection
                    : "";

            button.setAttribute(
                "aria-sort",
                isActive
                    ? (
                        currentSortDirection
                        === "asc"
                            ? "ascending"
                            : "descending"
                    )
                    : "none"
            );
        });
}

function handleSort(sortKey) {
    if (!sortKey) {
        return;
    }

    if (currentSortKey === sortKey) {
        currentSortDirection =
            currentSortDirection === "asc"
                ? "desc"
                : "asc";
    } else {
        currentSortKey = sortKey;
        currentSortDirection = "asc";
    }

    updateSortHeaderState();
    applySearch();
}

function renderSummary(dataRows) {
    const stockoutCount =
        dataRows.filter(
            (row) =>
                row.is_stockout_risk === true
        ).length;

    const depletedCount =
        dataRows.filter(
            (row) =>
                getNumber(
                    row.stock_before
                ) <= 0
        ).length;

    const overstockCount =
        dataRows.filter(
            (row) =>
                row.is_overstock === true
        ).length;

    const longTermCount =
        dataRows.filter(
            (row) =>
                row.is_long_term === true
        ).length;

    document.getElementById(
        "inventoryRiskTotalCount"
    ).textContent =
        `${formatNumber(dataRows.length)}종`;

    document.getElementById(
        "inventoryRiskStockoutCount"
    ).textContent =
        `${formatNumber(stockoutCount)}종`;

    document.getElementById(
        "inventoryRiskDepletedCount"
    ).textContent =
        `${formatNumber(depletedCount)}종`;

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
        getRiskLabels(row);

    if (!labels.length) {
        return "-";
    }

    return labels.map((label) => {
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
        } else {
            className +=
                " is-depleted";
        }

        return `
            <span class="${className}">
                ${label}
            </span>
        `;
    }).join("");
}

function renderTable(dataRows) {
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
        `${formatNumber(dataRows.length)}종`;

    if (!dataRows.length) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="12"
                    class="inventory-risk-empty"
                >
                    검색 조건에 해당하는 교재가 없습니다.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML =
        dataRows.map((row) => `
            <tr>
                <td>${escapeHtml(row.book_code)}</td>
                <td>${escapeHtml(row.barcode)}</td>
                <td>${escapeHtml(row.instructor_name)}</td>
                <td class="inventory-risk-book-name">
                    ${escapeHtml(row.book_name)}
                </td>
                <td>${escapeHtml(row.vendor_name)}</td>
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

function renderData(dataRows) {
    rows = [...dataRows];

    renderSummary(rows);
    applySearch();
}

function applySearch() {
    const riskType =
        normalizeText(
            document.getElementById(
                "inventoryRiskTypeSelect"
            )?.value
        );

    const fieldType =
        normalizeText(
            document.getElementById(
                "inventoryRiskFieldSelect"
            )?.value
        );

    const keyword =
        normalizeSearchText(
            document.getElementById(
                "inventoryRiskSearchInput"
            )?.value
        );

    const fieldName =
        getSearchFieldName(
            fieldType
        );

    const filtered =
        rows.filter((row) => {
            if (
                !isRiskMatch(
                    row,
                    riskType
                )
            ) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            return normalizeSearchText(
                row[fieldName]
            ).includes(keyword);
        });

    const sorted =
        sortRowsByColumn(
            filtered,
            currentSortKey,
            currentSortDirection
        );

    renderTable(sorted);
}

function resetSearch() {
    const typeSelect =
        document.getElementById(
            "inventoryRiskTypeSelect"
        );

    const fieldSelect =
        document.getElementById(
            "inventoryRiskFieldSelect"
        );

    const searchInput =
        document.getElementById(
            "inventoryRiskSearchInput"
        );

    if (typeSelect) {
        typeSelect.value =
            "stockout";
    }

    if (fieldSelect) {
        fieldSelect.value =
            "instructor";
    }

    if (searchInput) {
        searchInput.value = "";
    }

    currentSortKey = "";
    currentSortDirection = "asc";

    updateSortHeaderState();
    applySearch();
}

function bindEvents() {
    document
        .getElementById(
            "inventoryRiskSearchButton"
        )
        ?.addEventListener(
            "click",
            applySearch
        );

    document
        .getElementById(
            "inventoryRiskResetButton"
        )
        ?.addEventListener(
            "click",
            resetSearch
        );

    document
        .getElementById(
            "inventoryRiskSearchInput"
        )
        ?.addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    applySearch();
                }
            }
        );

    document
        .querySelectorAll(
            ".inventory-risk-sort-button"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    handleSort(
                        normalizeText(
                            button.dataset.sortKey
                        )
                    );
                }
            );
        });

    updateSortHeaderState();
}

function setStatus(message, isError = false) {
    const status =
        document.getElementById(
            "inventoryRiskStatus"
        );

    if (!status) {
        return;
    }

    status.classList.toggle(
        "error",
        isError
    );

    status.textContent =
        message;
}


async function loadSnapshotRows(meta) {
    const chunkCount =
        Number(meta?.chunk_count);

    if (
        !Number.isInteger(chunkCount)
        || chunkCount < 0
    ) {
        throw new Error(
            "inventory-risk meta의 chunk_count가 올바르지 않습니다."
        );
    }

    if (chunkCount === 0) {
        return [];
    }

    const chunkPromises =
        Array.from(
            {
                length: chunkCount
            },
            (_, index) =>
                getDocumentRow(
                    SNAPSHOT_COLLECTION_NAME,
                    `chunk_${String(
                        index + 1
                    ).padStart(4, "0")}`
                )
        );

    const chunkDocuments =
        await Promise.all(
            chunkPromises
        );

    const snapshotRows = [];

    chunkDocuments.forEach(
        (document, index) => {
            if (
                !document
                || !Array.isArray(
                    document.rows
                )
            ) {
                throw new Error(
                    `재고 snapshot chunk_${String(
                        index + 1
                    ).padStart(4, "0")}를 읽지 못했습니다.`
                );
            }

            snapshotRows.push(
                ...document.rows
            );
        }
    );

    return snapshotRows;
}

async function loadInventoryRisk() {
    const cache =
        readCache();

    setStatus(
        "교재 재고 현황의 변경 여부를 확인하고 있습니다."
    );

    let meta;

    try {
        meta =
            await getDocumentRow(
                META_COLLECTION_NAME,
                META_DOCUMENT_ID
            );
    } catch (error) {
        if (
            isCacheFresh(cache)
            && cache.rows.length
        ) {
            currentMeta = null;
            renderData(cache.rows);

            setStatus(
                "버전 확인에 실패하여 24시간 브라우저 캐시 자료를 표시합니다."
            );

            return;
        }

        throw error;
    }

    if (!active) {
        return;
    }

    currentMeta = meta;

    const currentVersion =
        getMetaVersion(meta);

    const cacheVersion =
        normalizeText(
            cache?.version
        );

    const canUseCache =
        isCacheFresh(cache)
        && cache.rows.length > 0
        && currentVersion
        && currentVersion === cacheVersion;

    if (canUseCache) {
        renderData(cache.rows);

        setStatus(
            `최종 업데이트: ${
                normalizeText(
                    meta?.updated_at
                ) || "-"
            } · 브라우저 캐시 사용`
        );

        return;
    }

    setStatus(
        currentVersion !== cacheVersion
            ? "변경된 교재 재고 자료를 불러오고 있습니다."
            : "24시간 캐시가 만료되어 교재 재고 자료를 새로 불러오고 있습니다."
    );

    const firestoreRows =
        await loadSnapshotRows(
            meta
        );

    if (!active) {
        return;
    }

    renderData(firestoreRows);

    writeCache(
        currentVersion,
        rows
    );

    setStatus(
        `최종 업데이트: ${
            normalizeText(
                meta?.updated_at
            ) || "-"
        }`
    );
}

function createMarkup() {
    return `
        <section class="inventory-risk-meta-card">
            <div>
                <span class="inventory-risk-meta-label">
                    데이터 기준
                </span>
                <strong class="inventory-risk-meta-title">
                    위험 재고 자동 분석
                </strong>
            </div>

            <p
                id="inventoryRiskStatus"
                class="period-status"
            >
                교재 재고 현황을 불러오고 있습니다.
            </p>
        </section>

        <section class="inventory-risk-summary-grid">
            <article class="inventory-risk-summary-card">
                <div class="inventory-risk-summary-head">
                    <span class="inventory-risk-summary-label">
                        이슈 교재 전체
                    </span>
                    <span class="inventory-risk-summary-mark">
                        전체
                    </span>
                </div>

                <strong
                    id="inventoryRiskTotalCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p class="inventory-risk-summary-description">
                    품절 위험·과다 재고·장기 재고·재고 소진 중
                    하나 이상에 해당하는 교재
                </p>
            </article>

            <article class="inventory-risk-summary-card is-stockout">
                <div class="inventory-risk-summary-head">
                    <span class="inventory-risk-summary-label">
                        품절 위험
                    </span>
                    <span class="inventory-risk-summary-mark">
                        주의
                    </span>
                </div>

                <strong
                    id="inventoryRiskStockoutCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p class="inventory-risk-summary-description">
                    현우진 31일 이하 ·
                    그 외 강사 16일 이하
                </p>
            </article>

            <article class="inventory-risk-summary-card is-depleted">
                <div class="inventory-risk-summary-head">
                    <span class="inventory-risk-summary-label">
                        예약판매 / 재고소진
                    </span>
                    <span class="inventory-risk-summary-mark">
                        소진
                    </span>
                </div>

                <strong
                    id="inventoryRiskDepletedCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p class="inventory-risk-summary-description">
                    출고전재고가 0 이하인 교재
                </p>
            </article>

            <article class="inventory-risk-summary-card is-overstock">
                <div class="inventory-risk-summary-head">
                    <span class="inventory-risk-summary-label">
                        과다 재고
                    </span>
                    <span class="inventory-risk-summary-mark">
                        과다
                    </span>
                </div>

                <strong
                    id="inventoryRiskOverstockCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p class="inventory-risk-summary-description">
                    금일 출고량 기준
                    출고가능일 90일 초과
                </p>
            </article>

            <article class="inventory-risk-summary-card is-long-term">
                <div class="inventory-risk-summary-head">
                    <span class="inventory-risk-summary-label">
                        장기 재고
                    </span>
                    <span class="inventory-risk-summary-mark">
                        장기
                    </span>
                </div>

                <strong
                    id="inventoryRiskLongTermCount"
                    class="inventory-risk-summary-value"
                >
                    0종
                </strong>

                <p class="inventory-risk-summary-description">
                    출간일이 기준일로부터
                    2년 이상 경과한 교재
                </p>
            </article>
        </section>

        <section class="dashboard-card inventory-risk-search-card">
            <div class="inventory-risk-search-row">
                <div class="inventory-risk-search-item">
                    <label for="inventoryRiskTypeSelect">
                        구분
                    </label>

                    <select id="inventoryRiskTypeSelect">
                        <option value="">
                            전체
                        </option>
                        <option value="stockout" selected>
                            품절 위험
                        </option>
                        <option value="overstock">
                            과다 재고
                        </option>
                        <option value="long-term">
                            장기 재고
                        </option>
                        <option value="depleted">
                            재고 소진
                        </option>
                    </select>
                </div>

                <div class="inventory-risk-search-item">
                    <label for="inventoryRiskFieldSelect">
                        선택
                    </label>

                    <select id="inventoryRiskFieldSelect">
                        <option value="instructor">
                            강사명
                        </option>
                        <option value="vendor">
                            거래처
                        </option>
                        <option value="book">
                            교재명
                        </option>
                    </select>
                </div>

                <div class="inventory-risk-keyword-box">
                    <input
                        id="inventoryRiskSearchInput"
                        type="text"
                        placeholder="검색어를 입력하세요"
                        autocomplete="off"
                    >
                </div>

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

            <p class="inventory-risk-search-help">
                구분과 검색 조건은 AND로 적용되며,
                검색어는 선택 항목의 일부 단어만 입력해도 조회됩니다.
                검색어가 없으면 구분 조건만 적용됩니다.
            </p>
        </section>

        <section class="dashboard-card inventory-risk-table-card">
            <div class="dashboard-card-header inventory-risk-table-header">
                <div>
                    <h2>교재 재고 상세</h2>
                    <p>
                        기본값은 품절 위험 교재이며,
                        거래처 → 출고가능일 오름차순
                    </p>
                </div>

                <strong
                    id="inventoryRiskResultCount"
                    class="inventory-risk-result-count"
                >
                    0종
                </strong>
            </div>

            <div class="inventory-risk-table-wrap">
                <table class="inventory-risk-table">
                    <thead>
                        <tr>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="book_code"
                                    aria-sort="none"
                                >
                                    <span>교재코드</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="barcode"
                                    aria-sort="none"
                                >
                                    <span>바코드</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="instructor_name"
                                    aria-sort="none"
                                >
                                    <span>강사명</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="book_name"
                                    aria-sort="none"
                                >
                                    <span>교재명</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="vendor_name"
                                    aria-sort="none"
                                >
                                    <span>거래처</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="stock_before"
                                    aria-sort="none"
                                >
                                    <span>출고전재고</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="defective_qty"
                                    aria-sort="none"
                                >
                                    <span>파본</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="dispatch_qty"
                                    aria-sort="none"
                                >
                                    <span>금일 출고</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="external_stock"
                                    aria-sort="none"
                                >
                                    <span>외부창고</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="available_stock"
                                    aria-sort="none"
                                >
                                    <span>출고후재고</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="available_days"
                                    aria-sort="none"
                                >
                                    <span>출고가능일</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
                            <th>
                                <button
                                    class="inventory-risk-sort-button"
                                    type="button"
                                    data-sort-key="risk"
                                    aria-sort="none"
                                >
                                    <span>구분</span>
                                    <span
                                        class="inventory-risk-sort-icon"
                                        aria-hidden="true"
                                    ></span>
                                </button>
                            </th>
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
        await loadInventoryRisk();
    } catch (error) {
        console.error(
            "[inventoryRisk]",
            error
        );

        if (!active) {
            return;
        }

        setStatus(
            "교재 재고 현황을 불러오지 못했습니다. Firestore 읽기 권한과 컬렉션을 확인해 주십시오.",
            true
        );
    }
}

export function unmount() {
    active = false;
}
