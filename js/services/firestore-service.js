// /js/services/firestore-service.js

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    documentId,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { recordFirestoreReads } from "./usage-tracker.js";

function mapSnapshot(snapshot) {
    return snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
    }));
}

export async function getCollectionRows(collectionName) {
    const snapshot = await getDocs(collection(db, collectionName));
    recordFirestoreReads(Math.max(1, snapshot.size));
    return mapSnapshot(snapshot);
}

export async function getDocumentRow(collectionName, documentIdValue) {
    const snapshot = await getDoc(
        doc(db, collectionName, documentIdValue)
    );

    recordFirestoreReads(1);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: snapshot.id,
        ...snapshot.data()
    };
}

export async function getCollectionRowsByDocumentIdRange(
    collectionName,
    startDocumentId,
    endDocumentId
) {
    const rangeQuery = query(
        collection(db, collectionName),
        where(documentId(), ">=", startDocumentId),
        where(documentId(), "<=", endDocumentId)
    );

    const snapshot = await getDocs(rangeQuery);
    recordFirestoreReads(Math.max(1, snapshot.size));
    return mapSnapshot(snapshot);
}

export async function getCollectionRowsByDocumentIdPrefix(
    collectionName,
    documentIdPrefix
) {
    const prefixQuery = query(
        collection(db, collectionName),
        where(documentId(), ">=", documentIdPrefix),
        where(documentId(), "<=", `${documentIdPrefix}\uf8ff`)
    );

    const snapshot = await getDocs(prefixQuery);
    recordFirestoreReads(Math.max(1, snapshot.size));
    return mapSnapshot(snapshot);
}

export async function getCollectionRowsByFieldEquals(
    collectionName,
    fieldName,
    fieldValue
) {
    const filteredQuery = query(
        collection(db, collectionName),
        where(fieldName, "==", fieldValue)
    );

    const snapshot = await getDocs(filteredQuery);
    recordFirestoreReads(Math.max(1, snapshot.size));
    return mapSnapshot(snapshot);
}

export async function getCollectionRowsByFieldEqualsAndRange(
    collectionName,
    equalityField,
    equalityValue,
    rangeField,
    startValue,
    endValue
) {
    const filteredQuery = query(
        collection(db, collectionName),
        where(equalityField, "==", equalityValue),
        where(rangeField, ">=", startValue),
        where(rangeField, "<=", endValue)
    );

    const snapshot = await getDocs(filteredQuery);
    recordFirestoreReads(Math.max(1, snapshot.size));
    return mapSnapshot(snapshot);
}

export function subscribeCollectionRowsByFieldEquals(
    collectionName,
    fieldName,
    fieldValue,
    onRows,
    onError
) {
    const filteredQuery = query(
        collection(db, collectionName),
        where(fieldName, "==", fieldValue)
    );

    return onSnapshot(
        filteredQuery,
        (snapshot) => {
            recordFirestoreReads(Math.max(1, snapshot.size));
            onRows(mapSnapshot(snapshot));
        },
        (error) => {
            if (typeof onError === "function") {
                onError(error);
            }
        }
    );
}

export async function addCollectionDocument(collectionName, data) {
    const reference = await addDoc(
        collection(db, collectionName),
        data
    );

    return reference.id;
}

export async function setCollectionDocument(
    collectionName,
    documentIdValue,
    data,
    options = {}
) {
    await setDoc(
        doc(db, collectionName, documentIdValue),
        data,
        options
    );
}

export async function updateCollectionDocument(
    collectionName,
    documentIdValue,
    data
) {
    await updateDoc(
        doc(db, collectionName, documentIdValue),
        data
    );
}

export async function deleteCollectionDocument(
    collectionName,
    documentIdValue
) {
    await deleteDoc(
        doc(db, collectionName, documentIdValue)
    );
}
