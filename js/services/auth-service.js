// /js/services/auth-service.js

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { auth } from "./firebase.js";
import {
    getDocumentRow
} from "./firestore-service.js";

export function observeAuth(callback) {
    return onAuthStateChanged(
        auth,
        callback
    );
}

export function login(
    email,
    password
) {
    return signInWithEmailAndPassword(
        auth,
        email,
        password
    );
}

export function logout() {
    return signOut(auth);
}

export async function getUserProfile(uid) {
    if (!uid) {
        throw new Error(
            "사용자 UID가 없습니다."
        );
    }

    const profile =
        await getDocumentRow(
            "users",
            uid
        );

    if (!profile) {
        return {
            role: "viewer",
            allowedMenus: ["dashboard"]
        };
    }

    return profile;
}
