import * as dashboardPage from "./pages/dashboard.js";
import * as shippingStatisticsPage from "./pages/shipping-statistics.js";

const routes = {
    dashboard: dashboardPage,
    "shipping-statistics": shippingStatisticsPage
};

let currentPage = null;

function routeNameFromHash() {
    const name = window.location.hash.replace(/^#\/?/, "");
    return routes[name] ? name : "dashboard";
}

export async function renderRoute() {
    const routeName = routeNameFromHash();
    const page = routes[routeName];
    currentPage?.unmount?.();
    currentPage = page;

    document.getElementById("pageTitle").textContent = page.title;
    document.querySelectorAll(".menu-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.route === routeName);
    });

    const content = document.getElementById("pageContent");
    const actions = document.getElementById("pageActions");
    content.innerHTML = "";
    actions.innerHTML = "";

    try {
        await page.mount({ content, actions });
    } catch (error) {
        console.error(`[route:${routeName}]`, error);
        content.innerHTML = `
            <div class="data-message">
                화면을 표시하지 못했습니다. 브라우저 콘솔의 오류를 확인해 주십시오.
            </div>
        `;
    }
}

export function startRouter() {
    window.addEventListener("hashchange", renderRoute);
    if (!window.location.hash) {
        window.location.hash = "#/dashboard";
        return;
    }
    renderRoute();
}

export function stopRouter() {
    currentPage?.unmount?.();
    currentPage = null;
    window.removeEventListener("hashchange", renderRoute);
}
