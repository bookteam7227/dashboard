// /js/services/data-cache.js

import { getDocumentRow } from "./firestore-service.js";

const VERSION_COLLECTION = "dashboard_meta";
const VERSION_DOCUMENT = "data_versions";
const STORAGE_PREFIX = "dashboard-data-cache:v1";

function storageKey(scope, key) {
    return `${STORAGE_PREFIX}:${scope}:${key}`;
}

function safeParse(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        console.error("[data-cache:parse]", error);
        return null;
    }
}

export async function getDataVersion(scope) {
    try {
        const row = await getDocumentRow(
            VERSION_COLLECTION,
            VERSION_DOCUMENT
        );

        return String(
            row?.[`${scope}_version`] || "0"
        );
    } catch (error) {
        console.error("[data-cache:version]", error);
        return null;
    }
}

export function getCachedData(
    scope,
    key,
    version,
    ttlMs
) {
    if (!version) {
        return null;
    }

    const entry = safeParse(
        localStorage.getItem(
            storageKey(scope, key)
        )
    );

    if (!entry) {
        return null;
    }

    if (String(entry.version || "") !== String(version)) {
        return null;
    }

    const cachedAt = Number(entry.cachedAt || 0);
    if (
        !cachedAt
        || Date.now() - cachedAt > ttlMs
    ) {
        return null;
    }

    return entry.data ?? null;
}

export function setCachedData(
    scope,
    key,
    version,
    data
) {
    if (!version) {
        return;
    }

    try {
        localStorage.setItem(
            storageKey(scope, key),
            JSON.stringify({
                version,
                cachedAt: Date.now(),
                data
            })
        );
    } catch (error) {
        console.error("[data-cache:write]", error);
    }
}
