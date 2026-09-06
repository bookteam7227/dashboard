// /js/router.js

import * as dashboardPage from "./pages/dashboard.js";
import * as shippingStatisticsPage from "./pages/shipping-statistics.js";

const routes = {
    dashboard: dashboardPage,
    "shipping-statistics": shippingStatisticsPage
};

let currentPage = null;

let accessControl = {
    role: "viewer",
    allowedMenus: ["dashboard"]
};

function isAdmin() {
    return accessControl.role === "admin";
}

function getAllowedRouteNames() {
    if (isAdmin()) {
        return Object.keys(routes);
    }

    const allowedMenus =
        Array.isArray(accessControl.allowedMenus)
            ? accessControl.allowedMenus
            : [];

    const allowedRoutes =
        allowedMenus.filter(
            (routeName) =>
                Object.prototype.hasOwnProperty.call(
                    routes,
                    routeName
                )
        );

    if (!allowedRoutes.includes("dashboard")) {
        allowedRoutes.unshift("dashboard");
    }

    return allowedRoutes;
}

function canAccessRoute(routeName) {
    return getAllowedRouteNames()
        .includes(routeName);
}

function updateMenuVisibility() {
    const allowedRoutes =
        new Set(
            getAllowedRouteNames()
        );

    document
        .querySelectorAll(".menu-link")
        .forEach((link) => {
            const routeName =
                link.dataset.route;

            const visible =
                allowedRoutes.has(routeName);

            link.hidden = !visible;
        });
}

function routeNameFromHash() {
    const name =
        window.location.hash.replace(
            /^#\/?/,
            ""
        );

    if (
        !routes[name]
        || !canAccessRoute(name)
    ) {
        return "dashboard";
    }

    return name;
}

export function setAccessControl({
    role,
    allowedMenus
}) {
    accessControl = {
        role:
            String(role || "viewer")
                .trim()
                .toLowerCase(),
        allowedMenus:
            Array.isArray(allowedMenus)
                ? [...allowedMenus]
                : ["dashboard"]
    };

    updateMenuVisibility();

    const requestedRoute =
        window.location.hash.replace(
            /^#\/?/,
            ""
        );

    if (
        requestedRoute
        && !canAccessRoute(requestedRoute)
    ) {
        window.location.hash =
            "#/dashboard";
    }
}

export async function renderRoute() {
    const requestedRoute =
        window.location.hash.replace(
            /^#\/?/,
            ""
        );

    const routeName =
        routeNameFromHash();

    if (
        requestedRoute
        && requestedRoute !== routeName
    ) {
        window.location.hash =
            `#/${routeName}`;

        return;
    }

    const page =
        routes[routeName];

    currentPage?.unmount?.();
    currentPage = page;

    document.getElementById(
        "pageTitle"
    ).textContent =
        page.title;

    document
        .querySelectorAll(".menu-link")
        .forEach((link) => {
            link.classList.toggle(
                "active",
                link.dataset.route === routeName
            );
        });

    const content =
        document.getElementById(
            "pageContent"
        );

    const actions =
        document.getElementById(
            "pageActions"
        );

    content.innerHTML = "";
    actions.innerHTML = "";

    try {
        await page.mount({
            content,
            actions
        });
    } catch (error) {
        console.error(
            `[route:${routeName}]`,
            error
        );

        content.innerHTML = `
            <div class="data-message">
                화면을 표시하지 못했습니다. 브라우저 콘솔의 오류를 확인해 주십시오.
            </div>
        `;
    }
}

export function startRouter() {
    updateMenuVisibility();

    window.addEventListener(
        "hashchange",
        renderRoute
    );

    if (!window.location.hash) {
        window.location.hash =
            "#/dashboard";

        return;
    }

    renderRoute();
}

export function stopRouter() {
    currentPage?.unmount?.();
    currentPage = null;

    window.removeEventListener(
        "hashchange",
        renderRoute
    );
}
