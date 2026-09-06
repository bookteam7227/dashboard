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

    return mapSnapshot(snapshot);
}
