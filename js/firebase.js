// Importa o Firebase direto da internet (CDN) para funcionar no navegador
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Tuas configurações do Projeto "financeiro-2-0"
const firebaseConfig = {
  apiKey: "AIzaSyApJ8y8ZpJ5nbqgE2nAmCBUXnv9QPgCPxo",
  authDomain: "financeiro-2-0.firebaseapp.com",
  projectId: "financeiro-2-0",
  storageBucket: "financeiro-2-0.firebasestorage.app",
  messagingSenderId: "634483286146",
  appId: "1:634483286146:web:9eda1901c34b24eb23149b"
};

// Inicia o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as ferramentas para usarmos no outro arquivo
export const db = getFirestore(app);
export const auth = getAuth(app);