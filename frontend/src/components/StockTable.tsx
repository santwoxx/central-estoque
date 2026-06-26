import React, { useState, useMemo } from "react";
import { StockItem, Company, UserRole } from "../types";
import { formatBRL } from "../utils";
import { 
  Search, 
  Trash2, 
  Edit, 
  Plus, 
  X, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  ShoppingBag, 
  Archive,
  RefreshCw,
  AlertTriangle
} from "lucide-react";

interface StockTableProps {
  items: StockItem[];
  isAdmin: boolean;
  user: { uid: string; email: string; displayName: string; role: UserRole; companyId?: string; companyName?: string };
  companies: Company[];
  onUpdateItem: (itemId: string, updatedFields: Partial<StockItem>, movementReason: string, quantityDiff?: number) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (itemData: Omit<StockItem, "id" | "userId" | "userEmail" | "createdAt" | "updatedAt">) => Promise<void>;
}

export default function StockTable({ items, isAdmin, user, companies, onUpdateItem, onDeleteItem, onAddItem }: StockTableProps) {
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [searchId, setSearchId] = useState(""); // Dedicated magnifying glass ID search
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "normal">("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [formCompanyId, setFormCompanyId] = useState("");

  // Modals & Sliders
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  
  // Checkout Modal (Saída de Estoque)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutItemId, setCheckoutItemId] = useState("");
  const [checkoutQuantity, setCheckoutQuantity] = useState(1);
  const [checkoutReason, setCheckoutReason] = useState("Venda");

  // Form Fields (Add/Edit)
  const [formSku, setFormSku] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formSize, setFormSize] = useState("");
  const [formQuantity, setFormQuantity] = useState(0);
  const [formPriceCash, setFormPriceCash] = useState(0);
  const [formPriceInstallment, setFormPriceInstallment] = useState(0);
  const [formNotes, setFormNotes] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [movementReason, setMovementReason] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Unique Brands in existing stock for filters
  const availableBrands = useMemo(() => {
    const list = items.map(item => item.brand.trim());
    return Array.from(new Set(list)).filter(b => b.length > 0).sort();
  }, [items]);

  // Unique Sizes in existing stock for filters
  const availableSizes = useMemo(() => {
    const list = items.map(item => item.size.trim());
    return Array.from(new Set(list)).filter(s => s.length > 0).sort();
  }, [items]);

  // Combined Filtering
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Text Search (Brand, Model, Size, Description)
      const matchesSearchText = searchTerm === "" || 
        item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.userEmail.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. ID / SKU Search (Magnifier Dedicated Search)
      const matchesIdSearch = searchId === "" || 
        item.sku.toLowerCase().includes(searchId.toLowerCase()) ||
        item.id.toLowerCase().includes(searchId.toLowerCase());

      // 3. Brand Filter
      const matchesBrand = selectedBrand === "" || item.brand === selectedBrand;

      // 4. Size Filter
      const matchesSize = selectedSize === "" || item.size === selectedSize;

      // 5. Stock alert warnings (Low <= 4 units)
      const matchesStock = stockFilter === "all" ||
        (stockFilter === "low" && item.quantity <= 4) ||
        (stockFilter === "normal" && item.quantity > 4);

      // 6. Company Filter
      const matchesCompany = selectedCompanyId === "" || item.companyId === selectedCompanyId;

      return matchesSearchText && matchesIdSearch && matchesBrand && matchesSize && matchesStock && matchesCompany;
    });
  }, [items, searchTerm, searchId, selectedBrand, selectedSize, stockFilter, selectedCompanyId]);

  // Open Edit Modals
  const handleOpenEdit = (item: StockItem) => {
    setEditingItem(item);
    setFormSku(item.sku);
    setFormBrand(item.brand);
    setFormModel(item.model);
    setFormSize(item.size);
    setFormQuantity(item.quantity);
    setFormPriceCash(item.priceCash || item.price || 0);
    setFormPriceInstallment(item.priceInstallment || item.price || 0);
    setFormNotes(item.notes);
    setFormDescription(item.description || "");
    setFormImageUrl(item.imageUrl || "");
    setFormCompanyId(item.companyId || "");
    setMovementReason("Geral / Ajuste de cadastro");
    setShowEditModal(true);
    setErrorMsg("");
  };

  const handleOpenAdd = () => {
    // Generate automatic suggestive SKU
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setFormSku(`PNEU-${randomSuffix}`);
    setFormBrand("");
    setFormModel("");
    setFormSize("");
    setFormQuantity(4);
    setFormPriceCash(399.00);
    setFormPriceInstallment(420.00);
    setFormNotes("");
    setFormDescription("");
    setFormImageUrl("");
    setFormCompanyId(user.companyId || "");
    setShowAddModal(true);
    setErrorMsg("");
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSku || !formBrand || !formModel || !formSize) {
      setErrorMsg("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    let matchedCompId = formCompanyId || user.companyId || "";
    let matchedCompName = "";
    if (matchedCompId) {
      const match = companies.find(c => c.id === matchedCompId);
      if (match) matchedCompName = match.name;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      await onAddItem({
        sku: formSku,
        brand: formBrand,
        model: formModel,
        size: formSize,
        quantity: Number(formQuantity),
        price: Number(formPriceCash),
        priceCash: Number(formPriceCash),
        priceInstallment: Number(formPriceInstallment),
        notes: formNotes,
        description: formDescription,
        imageUrl: formImageUrl,
        companyId: matchedCompId,
        companyName: matchedCompName
      });
      setShowAddModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao adicionar produto.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!formBrand || !formModel || !formSize) {
      setErrorMsg("Marcas, Modelos e Medidas são campos obrigatórios.");
      return;
    }

    let matchedCompId = formCompanyId || editingItem.companyId || user.companyId || "";
    let matchedCompName = "";
    if (matchedCompId) {
      const match = companies.find(c => c.id === matchedCompId);
      if (match) matchedCompName = match.name;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const updatedFields: Partial<StockItem> = {
        sku: formSku,
        brand: formBrand,
        model: formModel,
        size: formSize,
        quantity: Number(formQuantity),
        price: Number(formPriceCash),
        priceCash: Number(formPriceCash),
        priceInstallment: Number(formPriceInstallment),
        notes: formNotes,
        description: formDescription,
        imageUrl: formImageUrl,
        companyId: matchedCompId,
        companyName: matchedCompName
      };

      const quantityDiff = Number(formQuantity) - editingItem.quantity;
      await onUpdateItem(editingItem.id, updatedFields, movementReason || "Edição de cadastro", quantityDiff);
      setShowEditModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao atualizar dados.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCheckout = (preselectedItem?: StockItem) => {
    setErrorMsg("");
    setCheckoutQuantity(1);
    setCheckoutReason("Venda");
    if (preselectedItem) {
      setCheckoutItemId(preselectedItem.id);
    } else {
      setCheckoutItemId(items[0]?.id || "");
    }
    setShowCheckoutModal(true);
  };

  const handleSaveCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItemId) {
      setErrorMsg("Por favor, selecione um pneu.");
      return;
    }
    if (checkoutQuantity <= 0) {
      setErrorMsg("A quantidade deve ser maior que zero.");
      return;
    }

    const item = items.find(i => i.id === checkoutItemId);
    if (!item) {
      setErrorMsg("Pneu não encontrado.");
      return;
    }

    if (checkoutQuantity > item.quantity) {
      setErrorMsg(`Quantidade insuficiente em estoque. Disponível: ${item.quantity}`);
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const newQty = item.quantity - checkoutQuantity;
      const reason = checkoutReason.trim() || "Saída / Baixa manual";
      
      await onUpdateItem(item.id, { quantity: newQty }, reason, -checkoutQuantity);
      setShowCheckoutModal(false);
      setCheckoutItemId("");
      setCheckoutQuantity(1);
      setCheckoutReason("Venda");
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao dar baixa no pneu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
        {/* Search and Filters Hub */}
      <div className="bg-white p-5 rounded-2xl border-t-4 border-t-gold-500 border-x border-b border-slate-200/85 shadow-[0_10px_25px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex flex-col lg:flex-row gap-3.5 items-stretch justify-between">
          
          {/* Main search bar */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} className="stroke-[2.2px] text-gold-600" />
            </div>
            <input
              type="text"
              placeholder="Filtre por marca, modelo, descrição ou especificações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 font-semibold text-xs focus:bg-white focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 hover:border-slate-350 transition-all placeholder-slate-400 outline-none"
            />
          </div>

          {/* DEDICATED ID / SKU SEARCH (With a specific search layout - Magnifying glass focus) */}
          <div className="relative w-full lg:w-72 flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={14} className="stroke-[2.5px] text-gold-600" />
              </div>
              <input
                type="text"
                placeholder="PROCURAR ID / SKU..."
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                className="pl-8 pr-3 py-1.5 w-full bg-white border border-slate-200/80 rounded-lg text-slate-800 font-mono text-[11px] font-bold outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-400 tracking-wider placeholder:text-slate-355 uppercase"
              />
            </div>
            {searchId && (
              <button 
                type="button"
                onClick={() => setSearchId("")} 
                className="px-2 py-1 text-[9px] uppercase font-black text-slate-500 hover:text-red-650 transition-colors cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Checkout product action trigger */}
          <button
            type="button"
            onClick={() => handleOpenCheckout()}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs shadow-md border border-slate-700/30 transition-all cursor-pointer whitespace-nowrap shrink-0 hover:scale-[1.02] active:scale-[0.98]"
          >
            <TrendingDown size={15} className="stroke-[2.5px] text-red-400" /> Saída de Pneus
          </button>

          {/* Add product action trigger */}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-gold-600 via-gold-500 to-amber-500 text-white font-extrabold rounded-xl text-xs shadow-md shadow-gold-600/10 hover:shadow-gold-600/20 border border-gold-400/30 transition-all cursor-pointer whitespace-nowrap shrink-0 hover:scale-[1.02] active:scale-[0.98] hover:brightness-105"
          >
            <Plus size={15} className="stroke-[2.5px]" /> Cadastrar Peça / Pneu
          </button>
        </div>

        {/* Dynamic Filters Section */}
        <div className="flex flex-wrap items-center gap-3.5 border-t border-slate-100 pt-4 text-[11px] font-sans">
          
          {/* Brand filtering */}
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Filter size={13} className="text-gold-600 shrink-0" />
            <span className="text-slate-500 font-semibold">Marca:</span>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/15 focus:border-gold-500 font-semibold cursor-pointer"
            >
              <option value="">Todas</option>
              {availableBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Size filtering */}
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Filter size={13} className="text-gold-600 shrink-0" />
            <span className="text-slate-500 font-semibold">Tamanho:</span>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/15 focus:border-gold-500 font-semibold max-w-[180px] truncate cursor-pointer"
            >
              <option value="">Todas</option>
              {availableSizes.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Stock inventory filters */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/60 rounded-xl border border-slate-200/80">
            <span className="text-slate-500 font-bold px-2 text-[9px] uppercase tracking-wider">Estoque:</span>
            <button
              type="button"
              onClick={() => setStockFilter("all")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                stockFilter === "all" ? "bg-white text-gold-700 shadow-xs border border-slate-200 font-black" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("low")}
              className={`px-3 py-1 rounded-lg font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                stockFilter === "low" ? "bg-red-650 text-white shadow-xs" : "text-red-700 hover:bg-red-50"
              }`}
            >
              Estoque Baixo (≤4 un)
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("normal")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                stockFilter === "normal" ? "bg-white text-gold-700 shadow-xs border border-slate-200 font-black" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Normal
            </button>
          </div>

          {/* Company filtering (Admins only) */}
          {isAdmin && companies.length > 0 && (
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Filter size={13} className="text-gold-600 shrink-0" />
              <span className="text-slate-500 font-semibold">Empresa:</span>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/15 focus:border-gold-500 font-semibold max-w-[180px] truncate cursor-pointer"
              >
                <option value="">Todas</option>
                {companies.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Clear filters */}
          {(searchTerm !== "" || searchId !== "" || selectedBrand !== "" || selectedSize !== "" || stockFilter !== "all" || selectedCompanyId !== "") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSearchId("");
                setSelectedBrand("");
                setSelectedSize("");
                setStockFilter("all");
                setSelectedCompanyId("");
              }}
              className="text-[10px] font-bold text-red-650 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1.5 rounded-lg border border-red-100 transition-colors cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}

          {/* Dynamic counter logs */}
          <div className="ml-auto text-slate-400 font-extrabold text-[10px] uppercase tracking-widest hidden sm:block">
            Auditados: <span className="text-slate-800 font-extrabold text-xs">{filteredItems.length}</span> / {items.length} itens
          </div>
        </div>
      </div>

      {/* Main Stock Container */}
      <div className="bg-transparent overflow-hidden font-sans">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <Archive size={48} className="stroke-[1.5px] mb-3 text-slate-200" />
            <p className="font-bold text-slate-800 text-base">Nenhum produto encontrado</p>
            <p className="text-xs text-slate-500 max-w-sm mt-1 px-4">
              {items.length === 0 
                ? "Seu estoque está vazio. Comece clicando em 'Cadastrar Produto' ou faça uma importação inteligente de PDF de compras no botão acima."
                : "Ajuste os filtros de busca para visualizar outros resultados cadastrados."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* ====== DESKTOP TABLE VIEW: Visible on tablets and PCs ====== */}
            <div className="hidden md:block bg-white rounded-2xl border-t-2 border-t-gold-500/80 border-x border-b border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.015)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-sm table-fixed">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-extrabold sticky top-0">
                    <tr>
                      <th className="py-3 px-4 border-b border-slate-100 w-[70px] text-center font-black">Foto</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[125px] font-black">ID / SKU</th>
                      <th className="py-3 px-4 border-b border-slate-100 font-black">Produto & Especificações</th>
                      {isAdmin && <th className="py-3 px-4 border-b border-slate-100 w-[140px] font-black">Proprietário</th>}
                      <th className="py-3 px-4 border-b border-slate-100 w-[110px] text-center font-black">Estoque</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[100px] text-right font-black">À Vista</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[100px] text-right font-black">A Prazo</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[130px] font-black">Anotações</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[90px] text-center font-black">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
                    {filteredItems.map(item => {
                      const fallbackImg = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=150&q=80";
                      const activeImg = item.imageUrl || fallbackImg;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gold-50/10 text-slate-800 transition-all border-b border-slate-100/60">
                          
                          {/* Image Thumbnail Column */}
                          <td className="py-2.5 px-3 text-center align-middle">
                            <div className="h-10 w-10 mx-auto rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-gold-400 group hover:scale-[1.08] transition-all shadow-sm">
                              <img 
                                src={activeImg} 
                                className="h-full w-full object-cover group-hover:brightness-105" 
                                alt={item.model}
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </td>

                          {/* ID column with high density styling */}
                          <td className="py-2 px-4 font-semibold text-xs align-middle">
                            <span className="inline-block px-2.5 py-0.5 text-gold-700 bg-gold-400/10 rounded-lg border border-gold-500/20 font-mono tracking-wider font-extrabold uppercase shadow-xs">
                              {item.sku}
                            </span>
                          </td>

                          {/* Brand, Model, Size, and Description Column */}
                          <td className="py-2 px-4 align-middle">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 uppercase text-xs sm:text-sm">
                                {item.brand} <span className="font-normal text-slate-650">{item.model}</span>
                              </span>
                              <span className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">
                                Medida: {item.size}
                              </span>
                              {item.description && (
                                <p className="text-[11px] text-slate-405 truncate max-w-md mt-0.5" title={item.description}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Owner column (Visible to admin only) */}
                          {isAdmin && (
                            <td className="py-2 px-4 text-xs truncate align-middle" title={item.companyName || item.userEmail}>
                              {item.companyName ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black bg-[#1e1a12] text-gold-400 border border-gold-500/30 uppercase tracking-widest leading-none">
                                  {item.companyName}
                                </span>
                              ) : (
                                <>
                                  <span className="font-semibold text-slate-700 block max-w-full truncate">
                                    {item.userEmail.split('@')[0]}
                                  </span>
                                  <span className="text-[10px] text-slate-400 tracking-wider font-semibold block truncate">
                                    {item.userEmail}
                                  </span>
                                </>
                              )}
                            </td>
                          )}

                          {/* Quantity column */}
                          <td className="py-2 px-4 text-center align-middle">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-xs ${
                              item.quantity <= 4 
                                ? "bg-red-55 text-red-700 border border-red-200 ring-4 ring-red-100/30 animate-pulse font-extrabold" 
                                : "bg-emerald-50 text-emerald-800 border border-emerald-100"
                            }`}>
                              {item.quantity <= 4 && <AlertTriangle size={12} className="text-red-600 shrink-0" />}
                              {item.quantity} un
                            </span>
                          </td>

                          {/* Unit Price columns */}
                          <td className="py-2 px-4 text-right font-bold text-emerald-700 align-middle">
                            {(item.priceCash || item.price) > 0 ? formatBRL(item.priceCash || item.price) : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="py-2 px-4 text-right font-bold text-slate-900 align-middle">
                            {(item.priceInstallment || item.price) > 0 ? formatBRL(item.priceInstallment || item.price) : <span className="text-slate-300 font-normal">—</span>}
                          </td>

                          {/* Shelf Location or generic notes */}
                          <td className="py-2 px-4 text-xs text-slate-500 align-middle truncate" title={item.notes}>
                            {item.notes || <span className="text-slate-305 italic">Sem notas</span>}
                          </td>

                          {/* Actions column */}
                          <td className="py-2 px-4 text-center align-middle">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenCheckout(item)}
                                className="p-1.5 text-red-550 hover:bg-red-50 rounded transition-colors border border-transparent hover:border-red-200 cursor-pointer"
                                title="Registrar saída deste pneu (Baixa)"
                              >
                                <TrendingDown size={13} className="stroke-[2.5px]" />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1.5 text-blue-600 hover:bg-slate-100 rounded transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                                title="Ajustar estoque ou dados"
                              >
                                <Edit size={13} className="stroke-[2.5px]" />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Tem certeza que deseja DELETAR do estoque o produto ${item.brand} ${item.model} (${item.size})?`)) {
                                    onDeleteItem(item.id);
                                  }
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors border border-transparent hover:border-red-200 cursor-pointer"
                                title="Deletar permanentemente"
                              >
                                <Trash2 size={13} className="stroke-[2.5px]" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ====== MOBILE CARD VIEW: Visible only on cellphones ====== */}
            <div className="block md:hidden space-y-3">
              {filteredItems.map(item => {
                const fallbackImg = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=150&q=80";
                const activeImg = item.imageUrl || fallbackImg;
                
                return (
                  <div 
                    key={item.id} 
                    className={`bg-white rounded-xl p-3.5 border shadow-xs transition-all flex flex-col space-y-3 ${
                      item.quantity <= 4 ? "border-l-4 border-l-red-500 border-y border-r border-slate-200 bg-red-50/15" : "border-l-4 border-l-gold-500 border-y border-r border-slate-200"
                    }`}
                  >
                    
                    {/* Header line of product Card */}
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 text-[10px] text-gold-700 bg-gold-400/10 rounded-md border border-gold-300/30 font-mono font-black tracking-wider uppercase">
                        {item.sku}
                      </span>
                      {item.quantity <= 4 ? (
                        <span className="flex items-center gap-1 bg-red-100/90 text-red-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse">
                          <AlertTriangle size={10} /> Alerta Crítico
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-extrabold">
                          Estoque Seguro
                        </span>
                      )}
                    </div>

                    {/* Main item details row */}
                    <div className="flex gap-3">
                      
                      {/* Product Thumbnail image */}
                      <div className="h-16 w-16 rounded border border-slate-200 overflow-hidden bg-slate-50 flex-shrink-0 self-center">
                        <img 
                          src={activeImg} 
                          className="h-full w-full object-cover" 
                          alt={item.model} 
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Info details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold text-slate-900 leading-tight truncate text-xs uppercase">
                          {item.brand} <span className="font-semibold text-slate-700">{item.model}</span>
                        </h4>
                        <p className="text-[11px] font-mono text-slate-500 font-bold mt-0.5">
                          Espec: <span className="text-slate-800">{item.size}</span>
                        </p>
                        {item.description ? (
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {item.description}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-300 italic mt-0.5">
                            Sem descrição cadastrada
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                            Localização: {item.notes}
                          </p>
                        )}
                        {isAdmin && (
                          <div className="mt-1">
                            {item.companyName ? (
                              <span className="inline-block text-[10px] font-black bg-[#1e1a12] text-gold-400 px-2 py-0.5 rounded border border-gold-500/20 uppercase tracking-widest leading-none">
                                {item.companyName}
                              </span>
                            ) : (
                              <span className="text-[9px] text-[#1a5fb4] font-extrabold uppercase tracking-widest">
                                User: {item.userEmail.split('@')[0]}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Touch Quick Price and Inventory Adjuster */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      
                      <div className="flex gap-4">
                        <div>
                          <span className="text-[9px] text-emerald-600 block font-bold uppercase leading-none">À Vista</span>
                          <span className="font-black text-emerald-700 text-sm">
                            {(item.priceCash || item.price) > 0 ? formatBRL(item.priceCash || item.price) : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block font-bold uppercase leading-none">A Prazo</span>
                          <span className="font-black text-slate-900 text-sm">
                            {(item.priceInstallment || item.price) > 0 ? formatBRL(item.priceInstallment || item.price) : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Interactive direct mobile quick amount adjusters */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          title="Remover 1 unidade"
                          onClick={() => {
                            if (item.quantity > 0) {
                              onUpdateItem(item.id, { quantity: item.quantity - 1 }, "Baixa rápida via celular", -1);
                            }
                          }}
                          className="h-8 w-8 text-red-600 active:bg-slate-200 font-extrabold hover:text-red-700 flex items-center justify-center cursor-pointer select-none rounded text-lg transition-colors border border-transparent"
                        >
                          -
                        </button>
                        
                        <div className="px-2 text-center min-w-[2.5rem]">
                          <span className="block text-[11px] font-extrabold text-slate-900 font-mono">
                            {item.quantity}
                          </span>
                          <span className="text-[8px] text-slate-400 font-bold block uppercase leading-none">Unidade</span>
                        </div>

                        <button
                          type="button"
                          title="Adicionar 1 unidade"
                          onClick={() => {
                            onUpdateItem(item.id, { quantity: item.quantity + 1 }, "Entrada rápida via celular", 1);
                          }}
                          className="h-8 w-8 text-emerald-600 active:bg-slate-200 font-extrabold hover:text-emerald-700 flex items-center justify-center cursor-pointer select-none rounded text-lg transition-colors border border-transparent"
                        >
                          +
                        </button>
                      </div>

                    </div>

                    {/* Additional standard actions for edit/delete */}
                    <div className="flex justify-end gap-2 pt-1 border-t border-slate-50">
                      <button
                        onClick={() => handleOpenCheckout(item)}
                        className="py-1 px-3 text-[10px] font-bold text-red-650 bg-red-50 hover:bg-red-100 rounded border border-red-150 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <TrendingDown size={10} /> Registrar Saída
                      </button>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="py-1 px-3 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Edit size={10} /> Ajustar Cadastro
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Deseja deletar ${item.brand} ${item.model} permanentemente?`)) {
                            onDeleteItem(item.id);
                          }
                        }}
                        className="py-1 px-3 text-[10px] font-bold text-red-650 bg-red-50 hover:bg-red-150 rounded border border-red-150 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={10} /> Remover
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>

      {/* MODAL: ADD PRODUCT MANUAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6 border border-slate-200 shadow-2xl animate-scaleUp overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-105 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Cadastrar Novo Produto</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-900 rounded">
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 bg-red-50 text-red-700 text-xs p-2.5 rounded border border-red-100">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="mt-4 space-y-3 font-sans text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Identificador / SKU *</label>
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-mono font-bold uppercase outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marca / Fabricante *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Michelin / Bosch"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Modelo / Nome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Primacy 4 / H7"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Medida / Especificações *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 205/55R16 ou 12V 55W"
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estoque Inicial *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-emerald-700 mb-1">À Vista (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formPriceCash}
                      onChange={(e) => setFormPriceCash(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold text-right outline-none focus:ring-1 focus:ring-emerald-500 bg-emerald-50 text-emerald-800"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">A Prazo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formPriceInstallment}
                      onChange={(e) => setFormPriceInstallment(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold text-right outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Field: Company Selector (Visible to Admin only) */}
              {isAdmin && companies.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 font-sans">Empresa Proprietária *</label>
                  <select
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-205 rounded text-xs font-bold font-sans outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  >
                    <option value="">Selecione uma Empresa...</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição Detalhada</label>
                <textarea
                  rows={2}
                  placeholder="Escreva detalhes do produto, compatibilidade, lote, etc."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Imagem do Produto (URL ou Seleção Rápida)</label>
                <input
                  type="url"
                  placeholder="Cole uma URL da internet ou escolha uma das opções abaixo:"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-[11px] font-mono outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-800"
                />
                <div className="mt-2 flex items-center gap-1.5 bg-slate-100/55 p-1 rounded border border-slate-200">
                  <span className="text-[9px] uppercase font-bold text-slate-500 pl-1">Rápida:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1549317661-bd32c8ce0db2") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Pneu/Roda"
                    >
                      <img src="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1486006920555-c77dce18193b") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Auto Peças"
                    >
                      <img src="https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1507136566006-cfc505b114fc") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Ferramentas"
                    >
                      <img src="https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1511919884226-fd3cad34687c") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Motor/Peça"
                    >
                      <img src="https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                  </div>
                </div>

                {formImageUrl && (
                  <div className="mt-2 flex items-center gap-2 p-1.5 bg-blue-50/60 rounded border border-blue-100">
                    <img src={formImageUrl} className="h-8 w-8 object-cover rounded border border-blue-200" alt="Preview" referrerPolicy="no-referrer" />
                    <span className="text-[10px] text-blue-700 font-bold truncate">Visualização ativa para exibição</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Anotações Internas / Prateleira</label>
                <textarea
                  rows={1}
                  placeholder="Ex: Corredor B, Prateleira 4"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-750 hover:bg-slate-50 rounded border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {submitting ? "Cadastrando..." : "Cadastrar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRODUCT + MANAGE QUANTITY INPUT (Logs actual entry/exit movements) */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6 border border-slate-200 shadow-2xl animate-scaleUp overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-105 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Ficha e Ajuste do Produto</h3>
                <span className="text-[10px] text-slate-500 font-mono font-semibold tracking-wider">SKU: {editingItem.sku}</span>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 text-slate-400 hover:text-slate-900 rounded">
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 bg-red-50 text-red-700 text-xs p-2.5 rounded border border-red-100">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3 font-sans text-sm">
              
              {/* Core Attributes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marca</label>
                  <input
                    type="text"
                    required
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Modelo</label>
                  <input
                    type="text"
                    required
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Medida</label>
                  <input
                    type="text"
                    required
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-emerald-700 mb-1">À Vista (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formPriceCash}
                      onChange={(e) => setFormPriceCash(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold text-right outline-none focus:ring-1 focus:ring-emerald-500 bg-emerald-50 text-emerald-800"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">A Prazo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formPriceInstallment}
                      onChange={(e) => setFormPriceInstallment(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-xs font-bold text-right outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Field: Company Selector (Visible to Admin only) */}
              {isAdmin && companies.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 font-sans">Empresa Proprietária *</label>
                  <select
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-205 rounded text-xs font-bold font-sans outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                  >
                    <option value="">Selecione uma Empresa...</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Advanced Movement update section - super user friendly */}
              <div className="bg-slate-50 p-3.5 rounded border border-slate-205 space-y-2.5">
                <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity size={14} className="text-blue-600" /> Movimentar Estoque
                </span>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">Qtd Atual: <strong className="text-slate-900 font-bold">{editingItem.quantity} un</strong></label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 bg-white rounded text-xs font-bold text-center text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  
                  {/* Dynamic calculation of entry/exit to make it perfectly safe */}
                  <div className="text-center">
                    <span className="block text-[10px] font-semibold text-slate-400 uppercase">Ajuste de Saldo</span>
                    {formQuantity - editingItem.quantity > 0 ? (
                      <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold">
                        <TrendingUp size={12} /> +{formQuantity - editingItem.quantity} un (Entrada)
                      </span>
                    ) : formQuantity - editingItem.quantity < 0 ? (
                      <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold">
                        <TrendingDown size={12} /> {formQuantity - editingItem.quantity} un (Saída)
                      </span>
                    ) : (
                      <span className="inline-block mt-2 text-xs font-semibold text-slate-400">
                        Nenhum impacto físico
                      </span>
                    )}
                  </div>
                </div>

                {formQuantity - editingItem.quantity !== 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">Motivo da Movimentação *</label>
                    <select
                      required
                      value={movementReason}
                      onChange={(e) => setMovementReason(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-205 bg-white rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
                    >
                      <option value="">Selecione o motivo...</option>
                      <option value="Venda">Venda</option>
                      <option value="Transferência">Transferência</option>
                      <option value="Ajuste">Ajuste de Estoque</option>
                      <option value="Perda">Perda / Avaria</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição Detalhada</label>
                <textarea
                  rows={2}
                  placeholder="Escreva detalhes do produto, compatibilidade, lote, etc."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Imagem do Produto (URL ou Seleção Rápida)</label>
                <input
                  type="url"
                  placeholder="Cole uma URL da internet ou escolha uma das opções abaixo:"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-[11px] font-mono outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-800"
                />
                <div className="mt-2 flex items-center gap-1.5 bg-slate-100/55 p-1 rounded border border-slate-200">
                  <span className="text-[9px] uppercase font-bold text-slate-500 pl-1">Rápida:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1549317661-bd32c8ce0db2") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Pneu/Roda"
                    >
                      <img src="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1486006920555-c77dce18193b") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Auto Peças"
                    >
                      <img src="https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1507136566006-cfc505b114fc") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Ferramentas"
                    >
                      <img src="https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl("https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=300&q=80")}
                      className={`h-6 w-6 rounded-full overflow-hidden border transition-all ${formImageUrl.includes("photo-1511919884226-fd3cad34687c") ? "ring-2 ring-blue-600 scale-105" : "border-slate-300"}`}
                      title="Anexar Motor/Peça"
                    >
                      <img src="https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=50&q=50" className="h-full w-full object-cover" alt="" />
                    </button>
                  </div>
                </div>

                {formImageUrl && (
                  <div className="mt-2 flex items-center gap-2 p-1.5 bg-blue-50/60 rounded border border-blue-100">
                    <img src={formImageUrl} className="h-8 w-8 object-cover rounded border border-blue-200" alt="Preview" referrerPolicy="no-referrer" />
                    <span className="text-[10px] text-blue-700 font-bold truncate">Visualização ativa para exibição</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Anotações Internas / Prateleira</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-750 hover:bg-slate-50 rounded border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {submitting ? "Gravando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BAIXA DE ESTOQUE (SAÍDA DE PNEUS) */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-200/85 shadow-2xl animate-scaleUp overflow-y-auto max-h-[90vh] font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-red-50 text-red-650 flex items-center justify-center border border-red-100/50 shadow-inner">
                  <TrendingDown size={16} className="stroke-[2.5px]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Saída de Pneus</h3>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none">Baixa de estoque</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowCheckoutModal(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 bg-red-50 text-red-750 text-xs p-2.5 rounded-xl border border-red-100/80 font-semibold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveCheckout} className="mt-4 space-y-4 text-sm text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Selecionar Pneu / Peça</label>
                <select
                  value={checkoutItemId}
                  onChange={(e) => {
                    setCheckoutItemId(e.target.value);
                    setErrorMsg("");
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 bg-slate-50 text-slate-900 font-semibold cursor-pointer"
                >
                  <option value="" disabled>Escolha um pneu...</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.sku}] {item.brand} {item.model} {item.size} (Estoque: {item.quantity} un)
                    </option>
                  ))}
                </select>
                {items.length === 0 && (
                  <span className="text-[10px] text-red-500 font-semibold block mt-1">
                    Não há produtos disponíveis no estoque desta empresa.
                  </span>
                )}
              </div>

              {checkoutItemId && (
                (() => {
                  const selectedItem = items.find(i => i.id === checkoutItemId);
                  if (!selectedItem) return null;
                  return (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-550">Disponível em estoque:</span>
                      <span className={`px-2 py-0.5 rounded-md font-extrabold ${selectedItem.quantity <= 4 ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-800 border border-emerald-100"}`}>
                        {selectedItem.quantity} unidades
                      </span>
                    </div>
                  );
                })()
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Quantidade Vendida</label>
                  <input
                    type="number"
                    min="1"
                    value={checkoutQuantity}
                    onChange={(e) => setCheckoutQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 bg-slate-50 text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Motivo da Saída</label>
                  <select
                    value={checkoutReason}
                    onChange={(e) => setCheckoutReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 bg-slate-50 text-slate-900 font-semibold cursor-pointer"
                  >
                    <option value="Venda">Venda</option>
                    <option value="Ajuste de Estoque">Ajuste de Estoque</option>
                    <option value="Defeito / Descarte">Defeito / Descarte</option>
                    <option value="Uso Interno">Uso Interno</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              {checkoutReason === "Outro" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Especificar Outro Motivo</label>
                  <input
                    type="text"
                    placeholder="Ex: Doação, brinde, etc..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 bg-slate-50 text-slate-900 font-semibold"
                    onChange={(e) => setCheckoutReason(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || items.length === 0 || !checkoutItemId}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl disabled:opacity-50 transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  {submitting ? "Processando..." : "Confirmar Saída"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
