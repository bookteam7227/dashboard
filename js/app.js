import { login, logout, observeAuth } from "./services/auth-service.js";
import { renderRoute, startRouter, stopRouter } from "./router.js";

const loadingView = document.getElementById("loadingView");
const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const sessionEmail = document.getElementById("sessionEmail");

let routerStarted = false;

function showView(view) {
    loadingView.hidden = view !== "loading";
    loginView.hidden = view !== "login";
    dashboardView.hidden = view !== "dashboard";
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
        if (routerStarted) {
            stopRouter();
            routerStarted = false;
        }
        showView("login");
        return;
    }

    sessionEmail.textContent = user.email || "-";
    showView("dashboard");
    if (!routerStarted) {
        routerStarted = true;
        startRouter();
    } else {
        await renderRoute();
    }
});
