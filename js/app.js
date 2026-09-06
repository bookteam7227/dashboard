// /js/app.js

import {
    getUserProfile,
    login,
    logout,
    observeAuth
} from "./services/auth-service.js";
import {
    renderRoute,
    setAccessControl,
    startRouter,
    stopRouter
} from "./router.js";

const loadingView = document.getElementById("loadingView");
const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const sessionEmail = document.getElementById("sessionEmail");
const sessionRole = document.getElementById("sessionRole");

let routerStarted = false;

function showView(view) {
    loadingView.hidden = view !== "loading";
    loginView.hidden = view !== "login";
    dashboardView.hidden = view !== "dashboard";
}

function normalizeRole(role) {
    const normalized = String(role || "")
        .trim()
        .toLowerCase();

    if (
        normalized === "admin"
        || normalized === "관리자"
    ) {
        return "admin";
    }

    return "viewer";
}

function getSessionRoleText(role) {
    return role === "admin"
        ? "관리자"
        : "일반";
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginMessage.classList.remove("error");
    loginMessage.textContent = "로그인 중입니다.";
    loginButton.disabled = true;
    loginButton.textContent = "로그인 중...";

    try {
        await login(email, password);
        loginForm.reset();
    } catch (error) {
        console.error("[login]", error);
        loginMessage.classList.add("error");
        loginMessage.textContent = "이메일 또는 비밀번호를 확인해 주십시오.";
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "로그인";
    }
});

logoutButton.addEventListener("click", async () => {
    try {
        await logout();
    } catch (error) {
        console.error("[logout]", error);
    }
});

observeAuth(async (user) => {
    if (!user) {
        sessionEmail.textContent = "-";
        sessionRole.textContent = "일반";

        setAccessControl({
            role: "viewer",
            allowedMenus: ["dashboard"]
        });

        if (routerStarted) {
            stopRouter();
            routerStarted = false;
        }

        showView("login");
        return;
    }

    showView("loading");

    try {
        const profile =
            await getUserProfile(user.uid);

        const role =
            normalizeRole(profile?.role);

        const allowedMenus =
            Array.isArray(profile?.allowedMenus)
                ? profile.allowedMenus
                : ["dashboard"];

        setAccessControl({
            role,
            allowedMenus
        });

        sessionEmail.textContent =
            user.email || "-";

        sessionRole.textContent =
            getSessionRoleText(role);

        showView("dashboard");

        if (!routerStarted) {
            routerStarted = true;
            startRouter();
        } else {
            await renderRoute();
        }

    } catch (error) {
        console.error(
            "[user-profile]",
            error
        );

        sessionEmail.textContent = "-";
        sessionRole.textContent = "일반";

        if (routerStarted) {
            stopRouter();
            routerStarted = false;
        }

        showView("login");

        loginMessage.classList.add("error");
        loginMessage.textContent =
            "사용자 권한 정보를 불러오지 못했습니다. 잠시 후 다시 로그인해 주십시오.";
    }
});
