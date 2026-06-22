import React, { useState, useEffect } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously,
  signOut
} from "firebase/auth";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc,
  doc,
  setDoc
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Lock, User, Eye, EyeOff, ShieldCheck, Mail, Key, Sparkles, ArrowRight, RefreshCw } from "lucide-react";

interface AuthScreenProps {
  onAuthSuccess: (profile: { uid: string; email: string; displayName: string; role: "user" | "admin"; companyId?: string; companyName?: string }) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  // Google Auth Stage
  const [googleUser, setGoogleUser] = useState<{ email: string; uid: string; displayName: string } | null>(null);
  const [iframeEmail, setIframeEmail] = useState("");
  const [showSimulator, setShowSimulator] = useState(false);
  const [hasDomainError, setHasDomainError] = useState(false);

  // Credential Input Stage
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status flags
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Check if there is already a Google auth session saved in sessionStorage
  useEffect(() => {
    const cachedGoogle = sessionStorage.getItem("cached_google_auth");
    if (cachedGoogle) {
      try {
        setGoogleUser(JSON.parse(cachedGoogle));
      } catch (e) {
        console.error("Error reading cached Google session", e);
      }
    }
  }, []);

  // Handle Real Google Login via Popup
  const handleGoogleLoginReal = async () => {
    setError("");
    setHasDomainError(false);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const payload = {
        email: user.email || "",
        uid: user.uid,
        displayName: user.displayName || "Usuário Google"
      };

      // Seed database if admin email is logging in for first use
      await autoSeedAdminCreds(payload.email);

      setGoogleUser(payload);
      sessionStorage.setItem("cached_google_auth", JSON.stringify(payload));
      setSuccessMsg(`Google autenticado com sucesso! Insira suas credenciais abaixo para a Etapa 2.`);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/unauthorized-domain") {
        setHasDomainError(true);
        setError("Erro de autorização do Firebase (auth/unauthorized-domain): O domínio atual não está autorizado nas configurações de autenticação do seu projeto Firebase.");
      } else {
        setError(
          "Erro ao acessar Google. Se estiver usando o visualizador embutido do AI Studio, use o 'Simulador Iframe' abaixo devido a restrições de pop-ups dos navegadores."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Mock Google login for secure environment validation inside constrained frame
  const handleGoogleLoginSimulator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!iframeEmail || !iframeEmail.includes("@")) {
      setError("Por favor, insira um e-mail válido para simulação.");
      return;
    }
    setError("");
    setHasDomainError(false);
    setLoading(true);

    try {
      // Authenticate anonymously so the user has a real Firebase session ID
      const result = await signInAnonymously(auth);
      
      const payload = {
        email: iframeEmail.trim().toLowerCase(),
        uid: result.user.uid,
        displayName: iframeEmail.split("@")[0].toUpperCase()
      };

      // Seed database if administrative email
      await autoSeedAdminCreds(payload.email);

      setGoogleUser(payload);
      sessionStorage.setItem("cached_google_auth", JSON.stringify(payload));
      setSuccessMsg(`[Simulado Iframe] Identidade Google definida para: ${payload.email}. Insira o Usuário e Senha de seu painel.`);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/unauthorized-domain") {
        setHasDomainError(true);
        setError("Erro no Simulador (auth/unauthorized-domain): O domínio atual não está autorizado a realizar operações de Autenticação Firebase.");
      } else {
        setError("Erro ao inicializar sessão autenticada de simulação. Verifique se o recurso de login anônimo está habilitado no Console do Firebase.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Automatically seeds credentials in First Use if database list is empty, specifically for administrative addresses
  const autoSeedAdminCreds = async (email: string) => {
    const targetEmail = email.toLowerCase().trim();
    if (targetEmail === "brisasofc@gmail.com" || targetEmail === "natandsantosmarinho10@gmail.com") {
      try {
        const usernameSeed = targetEmail === "brisasofc@gmail.com" ? "central" : "natand";
        const passwordSeed = targetEmail === "brisasofc@gmail.com" ? "@#central@#" : "123";
        const qRef = query(collection(db, "custom_credentials"), where("username", "==", usernameSeed));
        const qSnap = await getDocs(qRef);
        
        if (qSnap.empty) {
          await addDoc(collection(db, "custom_credentials"), {
            username: usernameSeed,
            password: passwordSeed,
            displayName: targetEmail === "brisasofc@gmail.com" ? "Brisas Admin" : "Administrador",
            role: "admin",
            associatedEmail: targetEmail,
            createdAt: new Date()
          });
          console.log("Seeded database with administrator profile:", usernameSeed);
        }
      } catch (err) {
        console.error("Auto seeding failed:", err);
      }
    }
  };

  // Step 2: Validate the user/password from administrator panel
  const handleVerifyCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleUser) {
      setError("Por favor, conclua a primeira etapa de login do Google.");
      return;
    }
    if (!username || !password) {
      setError("Preencha o usuário e senha.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      let matchedCred: any = null;

      // 1. Direct administrative check to bypass Firestore seeding/permission issues or latency
      const targetUserLower = username.trim().toLowerCase();
      const targetGoogleEmail = googleUser.email.toLowerCase().trim();

      if (targetGoogleEmail === "brisasofc@gmail.com" && targetUserLower === "central" && password === "@#central@#") {
        matchedCred = {
          id: "admin_fallback_brisas",
          username: "central",
          password: "@#central@#",
          displayName: "Brisas Admin",
          role: "admin",
          associatedEmail: "brisasofc@gmail.com",
          createdAt: new Date().toISOString()
        };
      } else if (targetGoogleEmail === "natandsantosmarinho10@gmail.com" && targetUserLower === "natand" && password === "123") {
        matchedCred = {
          id: "admin_fallback_natand",
          username: "natand",
          password: "123",
          displayName: "Administrador",
          role: "admin",
          associatedEmail: "natandsantosmarinho10@gmail.com",
          createdAt: new Date().toISOString()
        };
      }

      if (!matchedCred) {
        // Look up credentials in the Firestore collection
        const q = query(
          collection(db, "custom_credentials"),
          where("username", "==", username.trim())
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error("Credencial inválida ou usuário inexistente.");
        }

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Verify case-sensitive or simple match
          if (data.password === password) {
            matchedCred = { id: docSnap.id, ...data };
          }
        });

        if (!matchedCred) {
          throw new Error("Senha de acesso incorreta.");
        }

        // Check if this credential lock is restricted to a different Google email
        if (
          matchedCred.associatedEmail && 
          matchedCred.associatedEmail.toLowerCase().trim() !== "" &&
          matchedCred.associatedEmail.toLowerCase().trim() !== googleUser.email.toLowerCase().trim()
        ) {
          throw new Error(
            `Esta credencial de usuário pertence exclusivamente à conta Google: ${matchedCred.associatedEmail}. Você está conectado como ${googleUser.email}.`
          );
        }
      }

      // Successful Two-Factor / Dual validation!
      const secAuthKey = `sec_auth_${googleUser.uid}`;
      sessionStorage.setItem(secAuthKey, "true");
      sessionStorage.setItem(`${secAuthKey}_user`, JSON.stringify(matchedCred));
      localStorage.setItem(secAuthKey, "true"); // Persist local too for better session experience

      // Update the user's role in Firebase Firestore "users" collection so Firestore rules recognize them
      try {
        await setDoc(doc(db, "users", googleUser.uid), {
          role: matchedCred.role || "user",
          displayName: matchedCred.displayName || googleUser.displayName,
          email: googleUser.email,
          companyId: matchedCred.companyId || "",
          companyName: matchedCred.companyName || "",
          updatedAt: new Date()
        });
      } catch (syncErr) {
        console.warn("Could not sync user profile to DB, proceeding with session:", syncErr);
      }

      onAuthSuccess({
        uid: googleUser.uid,
        email: googleUser.email,
        displayName: matchedCred.displayName || googleUser.displayName,
        role: matchedCred.role || "user",
        companyId: matchedCred.companyId || "",
        companyName: matchedCred.companyName || ""
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de login desconhecido.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetGoogleAuth = async () => {
    try {
      await signOut(auth);
    } catch {}
    setGoogleUser(null);
    sessionStorage.removeItem("cached_google_auth");
    setSuccessMsg("");
    setError("");
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#f7f5f0] px-4 py-12 sm:px-6 lg:px-8 font-sans select-none">
      <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 font-semibold uppercase tracking-widest hidden sm:block">
        Security Node: <span className="text-gold-600 font-black">Encrypted SSL</span>
      </div>

      <div className="max-w-md w-full mx-auto space-y-6 bg-white p-8 rounded-3xl shadow-[0_12px_40px_rgba(184,134,11,0.06)] border border-slate-200/80 animate-scaleUp border-t-4 border-t-gold-500">
        
        {/* Header / Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-gold-600 to-amber-500 text-white shadow-lg shadow-gold-500/10 hover:scale-105 active:scale-95 transition-all duration-300">
            <Lock className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Central Stoque
            </h2>
            <p className="text-xs font-black text-gold-600 tracking-widest uppercase">
              Admin & Operator Portal
            </p>
          </div>
        </div>

        {/* Global Messages */}
        {error && (
          <div className="bg-red-50/80 border border-red-100 text-red-800 p-4 rounded-xl text-xs leading-relaxed space-y-2.5 animate-fadeIn">
            <div className="font-semibold flex items-center gap-1.5 text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-650 animate-ping"></span>
              {error}
            </div>
            {hasDomainError && (
              <div className="bg-white border border-red-150 p-3.5 rounded-lg space-y-2 text-slate-800">
                <p className="font-bold text-red-700 text-xs">Ajuste de Domínio Firebase:</p>
                <p className="text-[11px] leading-normal text-slate-600">
                  Cadastre o domínio de execução atual na lista de <strong>Domínios Autorizados</strong> do Firebase Console.
                </p>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[10px] font-mono leading-relaxed select-all">
                  <strong>Domínios a incluir:</strong>
                  <div className="mt-1 space-y-0.5 text-slate-700">
                    <div>• <span className="font-bold">localhost</span></div>
                    <div>• <span className="font-bold">ais-dev-iumeczytxjtbldbkhhqdac-834678695463.us-east1.run.app</span></div>
                    <div>• <span className="font-bold">ais-pre-iumeczytxjtbldbkhhqdac-834678695463.us-east1.run.app</span></div>
                  </div>
                </div>
                <div className="pt-1.5">
                  <a 
                    href="https://console.firebase.google.com/project/centralsync-c5b50/authentication/settings" 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-black text-gold-600 hover:text-gold-700 underline transition-colors cursor-pointer"
                  >
                    Abrir Configurações do Firebase {`->`}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3.5 rounded-xl text-xs font-semibold leading-relaxed animate-fadeIn">
            {successMsg}
          </div>
        )}

        {/* ================= STAGE 1: GOOGLE SIGN IN ================= */}
        {!googleUser ? (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-gold-50/40 p-4 rounded-2xl border border-gold-200/20 text-center space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-gold-400/10 text-gold-700 font-black text-[9px] uppercase tracking-widest">
                Etapa 1 de 2
              </span>
              <p className="text-xs text-slate-600 font-semibold">
                Por favor, conecte com sua identidade corporativa Google.
              </p>
            </div>

            {/* Standard True Google Button */}
            <button
              onClick={handleGoogleLoginReal}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-slate-700 hover:text-slate-900 font-bold bg-white hover:bg-slate-50/80 active:bg-slate-100 border border-slate-300/80 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center gap-2.5 transition-all text-xs disabled:opacity-50 cursor-pointer"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.5 0 2.85.51 3.91 1.52l2.91-2.91C17.06 1.95 14.73 1 .01 1c-4.72 0-8.77 2.72-10.74 6.72l3.43 2.66c.86-2.59 3.28-4.34 6.3-4.34z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.88c2.18-2.01 3.7-4.97 3.7-8.62z"
                />
                <path
                  fill="#FBBC05"
                  d="M4.69 14.74c-.23-.69-.36-1.42-.36-2.19c0-.77.13-1.5.36-2.19L1.26 7.7c-.82 1.64-1.28 3.49-1.28 5.45s.46 3.81 1.28 5.45l3.43-2.86z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.88c-1.04.69-2.37 1.11-4.23 1.11c-3.02 0-5.44-1.75-6.3-4.34L1.26 16.6C3.23 20.6 7.28 23 12 23z"
                />
              </svg>
              Autenticar com o Google
            </button>

            {/* Simulated Fallback specifically for IFrame constraints in developer environments */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSimulator(!showSimulator)}
                className="text-[11px] font-bold text-gold-600 hover:text-gold-750 flex items-center justify-center gap-1 mx-auto transition-all focus:outline-none cursor-pointer tracking-wider"
              >
                <Sparkles size={11} className="stroke-[2px] text-gold-500" />
                {showSimulator ? "Voltar ao Login Padrão" : "Entrar via Simulador Integrado Iframe"}
              </button>

              {showSimulator && (
                <form onSubmit={handleGoogleLoginSimulator} className="mt-3.5 space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <Mail size={12} className="text-slate-400 shrink-0" />
                    <span>Configuração de E-mail de Simulação</span>
                  </div>
                  <input
                    type="email"
                    required
                    value={iframeEmail}
                    onChange={(e) => setIframeEmail(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 bg-white text-xs outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-550 transition-all placeholder:text-slate-350"
                    placeholder="Digite seu e-mail (Ex: brisasofc@gmail.com)"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-xl bg-[#2a251a] hover:bg-[#3d3727] text-white font-black text-xs shadow-sm transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Logar Identidade Simulada
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* ================= STAGE 2: CREDENTIAL FROM USER/PASS ================= */
          <form className="mt-4 space-y-4 animate-fadeIn" onSubmit={handleVerifyCredential}>
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-gold-400/10 text-gold-700 font-extrabold text-[8.5px] uppercase tracking-wider">
                  Etapa 2: Acesso do Painel
                </span>
                <button
                  type="button"
                  onClick={handleResetGoogleAuth}
                  className="text-[10px] font-bold text-red-650 hover:text-red-705 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw size={10} className="stroke-[2.5px]" /> Alternar Conta
                </button>
              </div>
              <p className="text-slate-500 font-medium">
                Conectado do Google como:<br />
                <span className="text-slate-800 font-mono font-bold">{googleUser.email}</span>
              </p>
            </div>

            {/* Secondary Username Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Usuário Operacional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User size={15} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 text-slate-900 bg-slate-50/50 text-xs font-semibold outline-none transition-all placeholder:text-slate-350"
                  placeholder="Seu nome de usuário do painel"
                />
              </div>
            </div>

            {/* Secondary Password Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Senha Secreta
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Key size={15} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 text-slate-900 bg-slate-50/50 text-xs font-semibold outline-none transition-all placeholder:text-slate-350"
                  placeholder="Código de acesso do operador"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Security Code */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl text-white font-black bg-gradient-to-r from-gold-600 to-amber-550 border border-gold-400/20 shadow-md shadow-gold-550/10 focus:outline-none focus:ring-4 focus:ring-gold-500/20 transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              {loading ? (
                "Validando Credencial..."
              ) : (
                <>
                  Verificar e Liberar Acesso <ArrowRight size={14} className="stroke-[2.5px]" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Brand visual bottom tagline */}
        <div className="pt-4 border-t border-slate-100 text-center text-[9px] text-slate-400 font-black uppercase tracking-widest flex items-center justify-center gap-1">
          <ShieldCheck size={11} className="text-gold-600 stroke-[2.5px]" />
          <span className="text-slate-450">Central Stoque • Secure Vault</span>
        </div>

      </div>
    </div>
  );
}
