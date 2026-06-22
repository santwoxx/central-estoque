import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { StockItem, MovementLog, UserProfile, UserRole, Company } from "./types";

// Components
import AuthScreen from "./components/AuthScreen";
import PDFImporter from "./components/PDFImporter";
import StockTable from "./components/StockTable";
import MovementReports from "./components/MovementReports";
import UsersAdmin from "./components/UsersAdmin";
import UnifiedStock from "./components/UnifiedStock";

// Icons
import { 
  LogOut, 
  Warehouse, 
  Layers, 
  FileUp, 
  Activity, 
  User, 
  ShieldCheck, 
  TrendingUp, 
  PackageCheck,
  PackageOpen,
  Users
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState<{ uid: string; email: string; displayName: string; role: UserRole; companyId?: string; companyName?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Data State
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Active Tab/View state
  const [activeTab, setActiveTab] = useState<"inventory" | "unified" | "pdf-import" | "reports" | "users-admin">("inventory");

  // Authentication Status listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const secAuthKey = `sec_auth_${firebaseUser.uid}`;
          const isSecAuthed = sessionStorage.getItem(secAuthKey) === "true" || localStorage.getItem(secAuthKey) === "true";
          
          if (!isSecAuthed) {
            setUser(null);
            setAuthLoading(false);
            return;
          }

          // Get the stored user credential details
          const cachedUserStr = sessionStorage.getItem(`${secAuthKey}_user`) || localStorage.getItem(`${secAuthKey}_user`);
          let role: UserRole = "alimentador";
          let displayName = firebaseUser.displayName || "Usuário comum";
          let companyId = "";
          let companyName = "";

          if (cachedUserStr) {
            try {
              const cachedUser = JSON.parse(cachedUserStr);
              let parsedRole = cachedUser.role || "alimentador";
              if (parsedRole === "user") parsedRole = "alimentador"; // Map legacy users
              role = parsedRole;
              displayName = cachedUser.displayName || displayName;
              companyId = cachedUser.companyId || "";
              companyName = cachedUser.companyName || "";
            } catch (e) {
              console.error("Failed to parse cached secondary credentials", e);
            }
          }

          // Safe guards for administrative emails
          const targetEmail = (firebaseUser.email || "").toLowerCase().trim();
          if (targetEmail === "brisasofc@gmail.com" || targetEmail === "isaacbomfim.te@gmail.com" || targetEmail === "isaacbomfim.00@gmail.com") {
            role = "admin";
          }

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            displayName,
            role,
            companyId,
            companyName
          });

          // Default tab logic based on role
          if (role === "vendedor") {
            setActiveTab("unified");
          } else {
            setActiveTab("inventory");
          }
        } catch (profileError) {
          console.error("Erro ao recuperar perfil:", profileError);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  // Listen to Firestore Stock and movements data in real-time
  useEffect(() => {
    if (!user) {
      setStock([]);
      setMovements([]);
      return;
    }

    setLoadingData(true);

    // Queries setup
    const stockCollectionRef = collection(db, "stock");
    const movementsCollectionRef = collection(db, "movements");

    // Admins and vendors query everything, alimentadores query only their own company's items!
    const stockQuery = (user.role === "admin" || user.role === "vendedor" || !user.companyId)
      ? stockCollectionRef
      : query(stockCollectionRef, where("companyId", "==", user.companyId));

    const movementsQuery = (user.role === "admin" || user.role === "vendedor" || !user.companyId)
      ? movementsCollectionRef
      : query(movementsCollectionRef, where("companyId", "==", user.companyId));

    // Listen to inventory changes
    const unsubStock = onSnapshot(stockQuery, (snapshot) => {
      const itemsList: StockItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        itemsList.push({
          id: docSnap.id,
          sku: data.sku || "",
          brand: data.brand || "",
          model: data.model || "",
          size: data.size || "",
          quantity: data.quantity ?? 0,
          price: data.price ?? 0,
          notes: data.notes || "",
          description: data.description || "",
          imageUrl: data.imageUrl || "",
          userId: data.userId || "",
          userEmail: data.userEmail || "",
          companyId: data.companyId || "",
          companyName: data.companyName || "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });

      // Sort by creation or update descending in memory to avoid index requirements
      const sortedItems = itemsList.sort((a, b) => {
        const timeA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setStock(sortedItems);
      setLoadingData(false);
    }, (error) => {
      console.error("Error fetching stock:", error);
      setLoadingData(false);
    });

    // Listen to audit logs changes
    const unsubMovements = onSnapshot(movementsQuery, (snapshot) => {
      const logsList: MovementLog[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        logsList.push({
          id: docSnap.id,
          sku: data.sku || "",
          brand: data.brand || "",
          model: data.model || "",
          size: data.size || "",
          type: data.type || "ENTRADA",
          quantity: data.quantity ?? 0,
          balanceAfter: data.balanceAfter ?? 0,
          userId: data.userId || "",
          userEmail: data.userEmail || "",
          companyId: data.companyId || "",
          companyName: data.companyName || "",
          timestamp: data.timestamp,
          reason: data.reason || ""
        });
      });

      // Sort logs by newest first in memory
      const sortedLogs = logsList.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });

      setMovements(sortedLogs);
    }, (error) => {
      console.error("Error fetching movements:", error);
    });

    return () => {
      unsubStock();
      unsubMovements();
    };
  }, [user]);

  // Listen to companies in real-time
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      return;
    }
    const unsubCompanies = onSnapshot(collection(db, "companies"), (snapshot) => {
      const list: Company[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name || "",
          description: data.description || "",
          createdAt: data.createdAt
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCompanies(list);
    }, (error) => {
      console.error("Error reading companies:", error);
    });

    return () => {
      unsubCompanies();
    };
  }, [user]);

  // Handle Logout action
  const handleLogout = async () => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        const secAuthKey = `sec_auth_${currentUid}`;
        sessionStorage.removeItem(secAuthKey);
        sessionStorage.removeItem(`${secAuthKey}_user`);
        localStorage.removeItem(secAuthKey);
        localStorage.removeItem(`${secAuthKey}_user`);
      }
      sessionStorage.removeItem("cached_google_auth");
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  // Add Tire Manual Form handler
  const handleAddItem = async (itemData: Omit<StockItem, "id" | "userId" | "userEmail" | "createdAt" | "updatedAt">) => {
    if (!user) return;

    try {
      // 1. Add Stock item
      await addDoc(collection(db, "stock"), {
        ...itemData,
        companyId: itemData.companyId || user.companyId || "",
        companyName: itemData.companyName || user.companyName || "",
        userId: user.uid,
        userEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Log primary entry movement log
      await addDoc(collection(db, "movements"), {
        sku: itemData.sku,
        brand: itemData.brand,
        model: itemData.model,
        size: itemData.size,
        type: "ENTRADA",
        quantity: itemData.quantity,
        balanceAfter: itemData.quantity,
        companyId: itemData.companyId || user.companyId || "",
        companyName: itemData.companyName || user.companyName || "",
        userId: user.uid,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        reason: "Cadastro inicial manual de pneu"
      });
    } catch (error) {
      console.error("Erro ao cadastrar pneu:", error);
      throw new Error("Erro ao salvar produto no banco de dados.");
    }
  };

  // Save imported PDF tires in bulk
  const handleSaveImportedItems = async (items: Omit<StockItem, "id" | "sku" | "userId" | "userEmail" | "createdAt" | "updatedAt" | "virtualId">[]) => {
    if (!user) return;

    try {
      for (const [idx, item] of items.entries()) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const skuPrefix = `PNEU-IA-${randomSuffix}`;

        // 1. Add item to stock
        await addDoc(collection(db, "stock"), {
          sku: skuPrefix,
          brand: item.brand,
          model: item.model,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes,
          companyId: item.companyId || user.companyId || "",
          companyName: item.companyName || user.companyName || "",
          userId: user.uid,
          userEmail: user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 2. Add log entry
        await addDoc(collection(db, "movements"), {
          sku: skuPrefix,
          brand: item.brand,
          model: item.model,
          size: item.size,
          type: "IMPORTACAO",
          quantity: item.quantity,
          balanceAfter: item.quantity,
          companyId: item.companyId || user.companyId || "",
          companyName: item.companyName || user.companyName || "",
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
          reason: `Pneu importado via IA / PDF (${idx + 1}/${items.length})`
        });
      }
    } catch (err) {
      console.error("Error saving bulk PDF tires:", err);
      throw new Error("Erro ao processar as inserções no banco de dados.");
    }
  };

  // Edit stock card & compute delta quantities for history logs
  const handleUpdateItem = async (itemId: string, updatedFields: Partial<StockItem>, reason: string, quantityDiff: number = 0) => {
    if (!user) return;

    try {
      const itemDocRef = doc(db, "stock", itemId);

      await updateDoc(itemDocRef, {
        ...updatedFields,
        updatedAt: serverTimestamp()
      });

      const matchedCompanyId = updatedFields.companyId || user.companyId || "";
      const matchedCompanyName = updatedFields.companyName || user.companyName || "";

      // Log movement history if quantity changed
      if (quantityDiff !== 0) {
        await addDoc(collection(db, "movements"), {
          sku: updatedFields.sku || "N/A",
          brand: updatedFields.brand || "N/A",
          model: updatedFields.model || "N/A",
          size: updatedFields.size || "N/A",
          type: quantityDiff > 0 ? "ENTRADA" : "SAIDA",
          quantity: quantityDiff,
          balanceAfter: updatedFields.quantity || 0,
          companyId: matchedCompanyId,
          companyName: matchedCompanyName,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
          reason: reason || "Ajuste físico de inventário font-semibold"
        });
      } else {
        // Just minor registry detail edit reason
        await addDoc(collection(db, "movements"), {
          sku: updatedFields.sku || "N/A",
          brand: updatedFields.brand || "N/A",
          model: updatedFields.model || "N/A",
          size: updatedFields.size || "N/A",
          type: "AJUSTE",
          quantity: 0,
          balanceAfter: updatedFields.quantity || 0,
          companyId: matchedCompanyId,
          companyName: matchedCompanyName,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
          reason: reason || "Dados cadastrais atualizados"
        });
      }
    } catch (err) {
      console.error("Erro ao atualizar item:", err);
      throw new Error("Erro ao gravar alterações.");
    }
  };

  // Remove pneu & audit exit
  const handleDeleteItem = async (itemId: string) => {
    if (!user) return;

    try {
      // Fetch target first to get particulars for movement auditing logs
      const itemToDrop = stock.find(item => item.id === itemId);
      if (!itemToDrop) return;

      await deleteDoc(doc(db, "stock", itemId));

      // Append Log of removal and set inventory balance to 0
      await addDoc(collection(db, "movements"), {
        sku: itemToDrop.sku,
        brand: itemToDrop.brand,
        model: itemToDrop.model,
        size: itemToDrop.size,
        type: "SAIDA",
        quantity: -itemToDrop.quantity,
        balanceAfter: 0,
        companyId: itemToDrop.companyId || user.companyId || "",
        companyName: itemToDrop.companyName || user.companyName || "",
        userId: user.uid,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        reason: "Exclusão permanente do produto do sistema"
      });
    } catch (err) {
      console.error("Erro ao excluir item:", err);
    }
  };

  // Loading indicator for authorization check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center font-sans gap-4 animate-fadeIn select-none">
        <div className="relative flex items-center justify-center">
          <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <Warehouse className="h-5 w-5 text-blue-400 absolute" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-white font-extrabold text-sm tracking-tight">Central Stoque</p>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Verificando Credenciais...</span>
        </div>
      </div>
    );
  }

  // Not signed-in -> render Auth Screen
  if (!user) {
    return <AuthScreen onAuthSuccess={(profile) => setUser(profile)} />;
  }

  // Calculate overview metrics for top panel header
  const totalStockItemsCount = stock.length;
  const totalPneumaticsSum = stock.reduce((acc, item) => acc + item.quantity, 0);
  const lowStockItems = stock.filter(item => item.quantity <= 4).length;

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col font-sans transition-colors text-slate-800">
      
      {/* Visual Header / Navigation Bar */}
      <nav className="bg-[#0b0f19] border-b border-gold-500/20 text-white shadow-[0_4px_30px_rgba(0,0,0,0.3)] sticky top-0 z-40 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* Left Brand Area */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-gold-600 via-gold-500 to-amber-200 text-[#0f172a] flex items-center justify-center shadow-lg shadow-gold-500/20 font-black hover:scale-105 active:scale-95 transition-all duration-300 border border-gold-300/30">
                <Warehouse className="h-5 w-5 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-base font-black text-white font-sans tracking-tight leading-none uppercase flex items-center gap-1.5">
                  Central Stoque <span className="text-[10px] text-gold-400 font-black tracking-normal lowercase italic bg-gold-500/10 px-1.5 py-0.5 rounded-md border border-gold-500/20">v2.0</span>
                </h1>
                <span className="text-[9px] uppercase font-black tracking-widest text-gold-400/90 block mt-1">SISTEMA PREMIUM DE GESTÃO</span>
              </div>
            </div>

            {/* Middle Nav Tab Link buttons */}
            <div className="hidden md:flex items-center gap-1.5">
              {(user.role === "vendedor" || user.role === "admin") && (
                <button
                  type="button"
                  onClick={() => setActiveTab("unified")}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border ${
                    activeTab === "unified" 
                      ? "bg-slate-900 text-gold-400 shadow-[0_2px_10px_rgba(212,147,33,0.15)] border-gold-500/30 font-black" 
                      : "text-slate-300 border-transparent hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Warehouse size={13} className="stroke-[2px]" /> Estoque Unificado
                </button>
              )}
              {(user.role === "alimentador" || user.role === "admin") && (
                <button
                  type="button"
                  onClick={() => setActiveTab("inventory")}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border ${
                    activeTab === "inventory" 
                      ? "bg-slate-900 text-gold-400 shadow-[0_2px_10px_rgba(212,147,33,0.15)] border-gold-500/30 font-black" 
                      : "text-slate-300 border-transparent hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Layers size={13} className="stroke-[2px]" /> Estoque Principal
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("pdf-import")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border ${
                  activeTab === "pdf-import" 
                    ? "bg-slate-900 text-gold-400 shadow-[0_2px_10px_rgba(212,147,33,0.15)] border-gold-500/30 font-black" 
                    : "text-slate-300 border-transparent hover:bg-slate-900 hover:text-white"
                }`}
              >
                <FileUp size={13} className="stroke-[2px]" /> Importar PDF (IA)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("reports")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border ${
                  activeTab === "reports" 
                    ? "bg-slate-900 text-gold-400 shadow-[0_2px_10px_rgba(212,147,33,0.15)] border-gold-500/30 font-black" 
                    : "text-slate-300 border-transparent hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Activity size={13} className="stroke-[2px]" /> Auditoria & Histórico
              </button>
              {user.role === "admin" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("users-admin")}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border ${
                    activeTab === "users-admin" 
                      ? "bg-slate-900 text-gold-400 shadow-[0_2px_10px_rgba(212,147,33,0.15)] border-gold-500/30 font-black" 
                      : "text-slate-300 border-transparent hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Users size={13} className="stroke-[2px]" /> Operadores e Senhas
                </button>
              )}
            </div>

            {/* Right Profile & Logout actions */}
            <div className="flex items-center gap-4">
              
              {/* Profile card badge */}
              <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                <div className="h-8.5 w-8.5 rounded-lg bg-slate-900 border border-gold-500/30 flex items-center justify-center text-gold-400 font-extrabold text-xs uppercase shadow-inner">
                  {user.displayName.substring(0, 2)}
                </div>
                <div className="hidden sm:block text-left leading-none space-y-1">
                  <span className="text-xs font-extrabold text-white block truncate max-w-[120px]">{user.displayName}</span>
                  {user.role === "admin" ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[8px] font-black bg-gold-600/20 text-gold-400 border border-gold-500/30 uppercase tracking-widest font-mono">
                      <ShieldCheck size={10} className="stroke-[2.5px]" /> Admin Master
                    </span>
                  ) : user.role === "vendedor" ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[8px] font-bold bg-blue-900/40 border border-blue-500/30 text-blue-300 uppercase tracking-wider">
                      Vendedor
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[8px] font-bold bg-slate-800 border border-slate-700 text-slate-300 uppercase tracking-wider">
                      Alimentador
                    </span>
                  )}
                </div>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-900 transition-all cursor-pointer"
                title="Sair do sistema piloto"
              >
                <LogOut size={16} />
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* Mobile navigation bottom bar */}
      <div className="md:hidden bg-[#0b0f19] border-t border-gold-500/20 fixed bottom-0 inset-x-0 h-16 z-40 flex items-stretch divide-x divide-slate-800 shadow-[0_-4px_25px_rgba(0,0,0,0.2)] overflow-x-auto">
        {(user.role === "vendedor" || user.role === "admin") && (
          <button
            type="button"
            onClick={() => setActiveTab("unified")}
            className={`min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1 transition-all px-1 ${
              activeTab === "unified" ? "text-gold-400 bg-slate-950 font-black shadow-inner" : "text-slate-400 hover:bg-slate-900/10"
            }`}
          >
            <Warehouse size={18} />
            <span className="text-[9px] font-extrabold uppercase tracking-wide">Geral</span>
          </button>
        )}
        {(user.role === "alimentador" || user.role === "admin") && (
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1 transition-all px-1 ${
              activeTab === "inventory" ? "text-gold-400 bg-slate-950 font-black shadow-inner" : "text-slate-400 hover:bg-slate-900/10"
            }`}
          >
            <Layers size={18} />
            <span className="text-[9px] font-extrabold uppercase tracking-wide">Estoque</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab("pdf-import")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "pdf-import" ? "text-gold-400 bg-slate-950 font-black shadow-inner" : "text-slate-400 hover:bg-slate-900/10"
          }`}
        >
          <FileUp size={18} />
          <span className="text-[9px] font-extrabold uppercase tracking-wide">PDF IA</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "reports" ? "text-gold-400 bg-slate-950 font-black shadow-inner" : "text-slate-400 hover:bg-slate-900/10"
          }`}
        >
          <Activity size={18} />
          <span className="text-[9px] font-extrabold uppercase tracking-wide">Relatórios</span>
        </button>
        {user.role === "admin" && (
          <button
            type="button"
            onClick={() => setActiveTab("users-admin")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "users-admin" ? "text-gold-400 bg-slate-950 font-black shadow-inner" : "text-slate-400 hover:bg-[#0b0f19]"
            }`}
          >
            <Users size={18} />
            <span className="text-[9px] font-extrabold uppercase tracking-wide">Operadores</span>
          </button>
        )}
      </div>

      {/* Main Application Content Container */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 mb-20 md:mb-12 flex-1 space-y-6">
        
        {/* Sub-Header KPI Dashlet Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 font-sans">
          
          {/* Card 1: Total SKUs */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-[0_4px_20px_rgba(0,0,0,0.015)] flex items-center justify-between hover:scale-[1.01] transition-transform duration-250">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Modelos Cadastrados</span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{totalStockItemsCount}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-inner">
              <PackageCheck size={20} className="stroke-[1.8]" />
            </div>
          </div>

          {/* Card 2: Total Sum of physical pneumatics units */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-[0_4px_20px_rgba(0,0,0,0.015)] flex items-center justify-between hover:scale-[1.01] transition-transform duration-250">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Volume de Pneus</span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {totalPneumaticsSum} <span className="text-xs font-bold text-slate-500 font-sans uppercase">unid.</span>
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-inner">
              <TrendingUp size={20} className="stroke-[1.8]" />
            </div>
          </div>

          {/* Card 3: Alert items */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-[0_4px_20px_rgba(0,0,0,0.015)] flex items-center justify-between hover:scale-[1.01] transition-transform duration-250">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Alertas de Reposição</span>
              <p className="text-2xl font-black text-red-650 tracking-tight flex items-baseline gap-1">
                {lowStockItems} <span className="text-xs font-bold text-slate-500 font-sans uppercase">críticos</span>
              </p>
            </div>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center border shadow-inner transition-colors duration-300 ${
              lowStockItems > 0 
                ? "bg-red-50 text-red-600 border-red-100 animate-pulse" 
                : "bg-slate-50 text-slate-400 border-slate-100"
            }`}>
              <PackageOpen size={20} className="stroke-[1.8]" />
            </div>
          </div>

        </div>

        {/* Dynamic Tab Panel switches */}
        <div className="transition-all duration-200">
          {activeTab === "unified" && (
            <div className="space-y-4">
              <UnifiedStock items={stock} />
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="space-y-4">
              {loadingData && (
                <div className="bg-blue-50 border border-blue-100/60 text-blue-800 px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm animate-fadeIn">
                  <div className="h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Sincronizando estoque operacional em tempo real...
                </div>
              )}
              <StockTable
                items={stock}
                isAdmin={user.role === "admin"}
                user={user}
                companies={companies}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
              />
            </div>
          )}

          {activeTab === "pdf-import" && (
            <PDFImporter 
              onSaveImportedItems={handleSaveImportedItems} 
               userEmail={user.email}
            />
          )}

          {activeTab === "reports" && (
            <MovementReports
              logs={movements}
               isAdmin={user.role === "admin"}
            />
          )}

          {activeTab === "users-admin" && user.role === "admin" && (
            <UsersAdmin />
          )}
        </div>

      </main>

    </div>
  );
}
