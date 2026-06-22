import React, { useState, useMemo } from "react";
import { StockItem } from "../types";
import { formatBRL } from "../utils";
import { Search, Filter, Archive, AlertTriangle } from "lucide-react";

interface UnifiedStockProps {
  items: StockItem[];
}

interface ConsolidatedItem {
  sku: string;
  brand: string;
  model: string;
  size: string;
  description: string;
  imageUrl: string;
  priceCash: number;
  priceInstallment: number;
  lastUpdated: any;
  totalQuantity: number;
  companyQuantities: Record<string, number>;
}

export default function UnifiedStock({ items }: UnifiedStockProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSize, setSelectedSize] = useState("");

  // Get unique brands and sizes for filters
  const availableBrands = useMemo(() => {
    const list = items.map(item => item.brand.trim());
    return Array.from(new Set(list)).filter(b => b.length > 0).sort();
  }, [items]);

  const availableSizes = useMemo(() => {
    const list = items.map(item => item.size.trim());
    return Array.from(new Set(list)).filter(s => s.length > 0).sort();
  }, [items]);

  // Consolidate Items by SKU
  const consolidatedItems = useMemo(() => {
    const map = new Map<string, ConsolidatedItem>();

    items.forEach(item => {
      const key = item.sku;
      if (!map.has(key)) {
        map.set(key, {
          sku: item.sku,
          brand: item.brand,
          model: item.model,
          size: item.size,
          description: item.description || "",
          imageUrl: item.imageUrl || "",
          priceCash: item.priceCash || item.price || 0,
          priceInstallment: item.priceInstallment || item.price || 0,
          lastUpdated: item.updatedAt || item.createdAt || 0,
          totalQuantity: 0,
          companyQuantities: {}
        });
      }

      const consolidated = map.get(key)!;
      
      // Accumulate quantities
      const compName = item.companyName || "Outros";
      consolidated.companyQuantities[compName] = (consolidated.companyQuantities[compName] || 0) + item.quantity;
      consolidated.totalQuantity += item.quantity;

      // Update timestamp if newer
      const itemTime = item.updatedAt?.seconds || item.createdAt?.seconds || 0;
      const consTime = consolidated.lastUpdated?.seconds || 0;
      if (itemTime > consTime) {
        consolidated.lastUpdated = item.updatedAt || item.createdAt;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }, [items]);

  // Unique company names across all consolidated items
  const allCompanyNames = useMemo(() => {
    const names = new Set<string>();
    consolidatedItems.forEach(ci => {
      Object.keys(ci.companyQuantities).forEach(name => names.add(name));
    });
    return Array.from(names).sort();
  }, [consolidatedItems]);

  // Filter Consolidated Items
  const filteredItems = useMemo(() => {
    return consolidatedItems.filter(item => {
      const matchesSearchText = searchTerm === "" || 
        item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBrand = selectedBrand === "" || item.brand === selectedBrand;
      const matchesSize = selectedSize === "" || item.size === selectedSize;

      return matchesSearchText && matchesBrand && matchesSize;
    });
  }, [consolidatedItems, searchTerm, selectedBrand, selectedSize]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Search and Filters Hub */}
      <div className="bg-white p-5 rounded-2xl border-t-4 border-t-blue-500 border-x border-b border-slate-200/85 shadow-[0_10px_25px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex flex-col lg:flex-row gap-3.5 items-stretch justify-between">
          
          {/* Main search bar */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} className="stroke-[2.2px] text-blue-600" />
            </div>
            <input
              type="text"
              placeholder="Filtre por marca, modelo, código ou especificações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 font-semibold text-xs focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 hover:border-slate-350 transition-all placeholder-slate-400 outline-none"
            />
          </div>
        </div>

        {/* Dynamic Filters Section */}
        <div className="flex flex-wrap items-center gap-3.5 border-t border-slate-100 pt-4 text-[11px] font-sans">
          
          {/* Brand filtering */}
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Filter size={13} className="text-blue-600 shrink-0" />
            <span className="text-slate-500 font-semibold">Marca:</span>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-semibold cursor-pointer"
            >
              <option value="">Todas</option>
              {availableBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Size filtering */}
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Filter size={13} className="text-blue-600 shrink-0" />
            <span className="text-slate-500 font-semibold">Tamanho:</span>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-semibold max-w-[180px] truncate cursor-pointer"
            >
              <option value="">Todas</option>
              {availableSizes.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Quick Clear filters */}
          {(searchTerm !== "" || selectedBrand !== "" || selectedSize !== "") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSelectedBrand("");
                setSelectedSize("");
              }}
              className="text-[10px] font-bold text-red-650 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1.5 rounded-lg border border-red-100 transition-colors cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}

          <div className="ml-auto text-slate-400 font-extrabold text-[10px] uppercase tracking-widest hidden sm:block">
            Mostrando: <span className="text-slate-800 font-extrabold text-xs">{filteredItems.length}</span> produtos únicos
          </div>
        </div>
      </div>

      {/* Main Stock Container */}
      <div className="bg-transparent overflow-hidden font-sans">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <Archive size={48} className="stroke-[1.5px] mb-3 text-slate-200" />
            <p className="font-bold text-slate-800 text-base">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ====== DESKTOP TABLE VIEW: Visible on tablets and PCs ====== */}
            <div className="hidden md:block bg-white rounded-2xl border-t-2 border-t-blue-500/80 border-x border-b border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.015)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-sm table-fixed">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-extrabold sticky top-0">
                    <tr>
                      <th className="py-3 px-4 border-b border-slate-100 w-[70px] text-center font-black">Foto</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[110px] font-black">Código</th>
                      <th className="py-3 px-4 border-b border-slate-100 font-black">Produto & Especificações</th>
                      
                      {/* Dynamic Company Columns */}
                      {allCompanyNames.map(name => (
                         <th key={name} className="py-3 px-4 border-b border-slate-100 w-[90px] text-center font-black">
                           {name}
                         </th>
                      ))}

                      <th className="py-3 px-4 border-b border-slate-100 w-[110px] text-right font-black">À Vista</th>
                      <th className="py-3 px-4 border-b border-slate-100 w-[110px] text-right font-black">A Prazo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
                    {filteredItems.map(item => {
                      const fallbackImg = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=150&q=80";
                      const activeImg = item.imageUrl || fallbackImg;
                      
                      return (
                        <tr key={item.sku} className="hover:bg-blue-50/10 text-slate-800 transition-all border-b border-slate-100/60">
                          
                          <td className="py-2.5 px-3 text-center align-middle">
                            <div className="h-10 w-10 mx-auto rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-blue-400 group hover:scale-[1.08] transition-all shadow-sm">
                              <img 
                                src={activeImg} 
                                className="h-full w-full object-cover group-hover:brightness-105" 
                                alt={item.model}
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </td>

                          <td className="py-2 px-4 font-semibold text-xs align-middle">
                            <span className="inline-block px-2.5 py-0.5 text-blue-700 bg-blue-400/10 rounded-lg border border-blue-500/20 font-mono tracking-wider font-extrabold uppercase shadow-xs">
                              {item.sku}
                            </span>
                          </td>

                          <td className="py-2 px-4 align-middle">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 uppercase text-xs sm:text-sm">
                                {item.brand} <span className="font-normal text-slate-650">{item.model}</span>
                              </span>
                              <span className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">
                                Medida: {item.size}
                              </span>
                            </div>
                          </td>

                          {/* Dynamic Company Quantities */}
                          {allCompanyNames.map(name => {
                            const qty = item.companyQuantities[name] || 0;
                            return (
                              <td key={name} className="py-2 px-4 text-center align-middle border-l border-slate-50">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-xs ${
                                  qty === 0 
                                    ? "text-slate-300"
                                    : qty <= 4 
                                    ? "bg-red-50 text-red-700 border border-red-200" 
                                    : "bg-emerald-50 text-emerald-800 border border-emerald-100"
                                }`}>
                                  {qty > 0 ? `${qty} un` : "-"}
                                </span>
                              </td>
                            );
                          })}

                          <td className="py-2 px-4 text-right font-bold text-emerald-700 align-middle">
                            {item.priceCash > 0 ? formatBRL(item.priceCash) : <span className="text-slate-300 font-normal">—</span>}
                          </td>

                          <td className="py-2 px-4 text-right font-bold text-slate-900 align-middle">
                            {item.priceInstallment > 0 ? formatBRL(item.priceInstallment) : <span className="text-slate-300 font-normal">—</span>}
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
                    key={item.sku} 
                    className="bg-white rounded-xl p-3.5 border border-l-4 border-l-blue-500 border-y border-r border-slate-200 shadow-xs transition-all flex flex-col space-y-3"
                  >
                    
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 text-[10px] text-blue-700 bg-blue-400/10 rounded-md border border-blue-300/30 font-mono font-black tracking-wider uppercase">
                        {item.sku}
                      </span>
                      <span className="text-[10px] text-slate-500 font-extrabold">
                        Total Geral: <span className="text-slate-800">{item.totalQuantity} un</span>
                      </span>
                    </div>

                    <div className="flex gap-3">
                      <div className="h-16 w-16 rounded border border-slate-200 overflow-hidden bg-slate-50 flex-shrink-0 self-center">
                        <img 
                          src={activeImg} 
                          className="h-full w-full object-cover" 
                          alt={item.model} 
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold text-slate-900 leading-tight truncate text-xs uppercase">
                          {item.brand} <span className="font-semibold text-slate-700">{item.model}</span>
                        </h4>
                        <p className="text-[11px] font-mono text-slate-500 font-bold mt-0.5">
                          Espec: <span className="text-slate-800">{item.size}</span>
                        </p>
                      </div>
                    </div>

                    {/* Company Quantities Grid Mobile */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                       {allCompanyNames.map(name => {
                         const qty = item.companyQuantities[name] || 0;
                         return (
                           <div key={name} className="flex flex-col items-center p-1.5 bg-slate-50 rounded border border-slate-100">
                             <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 truncate w-full text-center">{name}</span>
                             <span className={`text-xs font-black mt-0.5 ${qty === 0 ? "text-slate-300" : qty <= 4 ? "text-red-600" : "text-emerald-700"}`}>
                               {qty} un
                             </span>
                           </div>
                         );
                       })}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 px-1">
                      <div>
                        <span className="text-[9px] text-emerald-600 block font-bold uppercase leading-none">À Vista</span>
                        <span className="font-black text-emerald-700 text-sm">
                          {item.priceCash > 0 ? formatBRL(item.priceCash) : "—"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block font-bold uppercase leading-none">A Prazo</span>
                        <span className="font-black text-slate-900 text-sm">
                          {item.priceInstallment > 0 ? formatBRL(item.priceInstallment) : "—"}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
