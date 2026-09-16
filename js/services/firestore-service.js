// /js/services/firestore-service.js

import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase.js";
import {
    recordFirestoreReads
} from "./usage-tracker.js";

function mapSnapshot(snapshot) {
    return snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
    }));
}

export async function getCollectionRows(collectionName) {
    const snapshot = await getDocs(
        collection(db, collectionName)
    );

    recordFirestoreReads(Math.max(1, snapshot.size));

    return mapSnapshot(snapshot);
}

export async function getDocumentRow(
    collectionName,
    documentIdValue
) {
    const snapshot = await getDoc(
        doc(
            db,
            collectionName,
            documentIdValue
        )
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
        where(
            documentId(),
            ">=",
            startDocumentId
        ),
        where(
            documentId(),
            "<=",
            endDocumentId
        )
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
        where(
            documentId(),
            ">=",
            documentIdPrefix
        ),
        where(
            documentId(),
            "<=",
            `${documentIdPrefix}\uf8ff`
        )
    );

    const snapshot = await getDocs(prefixQuery);

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
        where(
            equalityField,
            "==",
            equalityValue
        ),
        where(
            rangeField,
            ">=",
            startValue
        ),
        where(
            rangeField,
            "<=",
            endValue
        )
    );

    const snapshot = await getDocs(filteredQuery);

    recordFirestoreReads(Math.max(1, snapshot.size));

    return mapSnapshot(snapshot);
}
