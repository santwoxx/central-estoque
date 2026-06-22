import React, { useState, useMemo } from "react";
import { StockItem } from "../types";
import { Search } from "lucide-react";

interface UnifiedStockProps {
  items: StockItem[];
  user: { uid: string; email: string; displayName: string; role: string; companyId?: string; companyName?: string };
  onUpdateItem: (itemId: string, updatedFields: Partial<StockItem>, reason: string, quantityDiff?: number) => Promise<void>;
  onAddItem: (itemData: Omit<StockItem, "id" | "userId" | "userEmail" | "createdAt" | "updatedAt">) => Promise<void>;
}

interface ConsolidatedItem {
  sku: string;
  description: string; // combined size + brand + model
  brand: string;
  model: string;
  size: string;
  priceCash: number;
  priceInstallment: number;
  docs: Record<string, StockItem>; // "SAJ", "AUTOCAR", "AUTOCENTER"
}

const FIXED_COMPANIES = ["SAJ", "AUTOCAR", "AUTOCENTER"];

export default function UnifiedStock({ items, user, onUpdateItem, onAddItem }: UnifiedStockProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCell, setEditingCell] = useState<{ sku: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loadingSku, setLoadingSku] = useState("");

  const userCompanyNorm = (user.companyName || "").toUpperCase().trim();
  // Vendedores não podem editar. Admins podem editar tudo? A prompt diz "Cada alimentador só pode alterar o estoque da sua própria unidade". Admins (controle total) devem poder alterar de todas.
  const isAdmin = user.role === "admin";
  const isVendedor = user.role === "vendedor";

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
          description: `${item.size} ${item.brand} ${item.model}`.trim(),
          priceCash: item.priceCash || item.price || 0,
          priceInstallment: item.priceInstallment || item.price || 0,
          docs: {}
        });
      }

      const cons = map.get(key)!;
      
      let compNorm = (item.companyName || "").toUpperCase().trim();
      // Match with fixed companies if possible
      if (compNorm.includes("SAJ")) compNorm = "SAJ";
      else if (compNorm.includes("AUTOCAR")) compNorm = "AUTOCAR";
      else if (compNorm.includes("CENTER")) compNorm = "AUTOCENTER";
      
      cons.docs[compNorm] = item;
      
      // Update prices to be the highest or most recent found (as baseline display)
      if (item.priceCash && item.priceCash > cons.priceCash) cons.priceCash = item.priceCash;
      if (item.priceInstallment && item.priceInstallment > cons.priceInstallment) cons.priceInstallment = item.priceInstallment;
    });

    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return consolidatedItems;
    const lower = searchTerm.toLowerCase();
    return consolidatedItems.filter(item => 
      item.sku.toLowerCase().includes(lower) || 
      item.description.toLowerCase().includes(lower) ||
      item.brand.toLowerCase().includes(lower)
    );
  }, [consolidatedItems, searchTerm]);

  const canEditCompany = (colName: string) => {
    if (isVendedor) return false;
    if (isAdmin) return true;
    // Alimentador só pode editar a sua própria
    let uComp = userCompanyNorm;
    if (uComp.includes("SAJ")) uComp = "SAJ";
    else if (uComp.includes("AUTOCAR")) uComp = "AUTOCAR";
    else if (uComp.includes("CENTER")) uComp = "AUTOCENTER";
    return uComp === colName;
  };

  const startEdit = (item: ConsolidatedItem, field: string, currentValue: string) => {
    if (isVendedor) return;
    
    // Check permission
    if (FIXED_COMPANIES.includes(field) && !canEditCompany(field)) return;
    if ((field === "priceCash" || field === "priceInstallment") && !isAdmin && !FIXED_COMPANIES.some(c => canEditCompany(c))) {
      // Must belong to at least one company to edit price (or admin)
      return;
    }

    setEditingCell({ sku: item.sku, field });
    setEditValue(currentValue);
  };

  const handleSaveEdit = async (item: ConsolidatedItem) => {
    if (!editingCell) return;
    setLoadingSku(item.sku);
    
    try {
      const field = editingCell.field;
      const numValue = parseFloat(editValue.replace(",", ".")) || 0;

      if (FIXED_COMPANIES.includes(field)) {
        // Editing Quantity for a specific company
        const existingDoc = item.docs[field];
        if (existingDoc) {
          const diff = numValue - existingDoc.quantity;
          if (diff !== 0) {
            const reason = diff > 0 ? "Ajuste manual de entrada" : "Baixa manual";
            await onUpdateItem(existingDoc.id, { quantity: numValue }, reason, diff);
          }
        } else {
          // Add new item doc for this company
          if (numValue > 0) {
            // Get original company ID if user is not admin, else leave it generic or try to find it
            const cId = !isAdmin ? user.companyId : "";
            const cName = !isAdmin ? user.companyName : field;

            await onAddItem({
              sku: item.sku,
              brand: item.brand,
              model: item.model,
              size: item.size,
              description: item.description,
              imageUrl: "",
              priceCash: item.priceCash,
              priceInstallment: item.priceInstallment,
              quantity: numValue,
              notes: "Criado via planilha",
              companyId: cId || "",
              companyName: cName || field
            });
          }
        }
      } else if (field === "priceCash" || field === "priceInstallment") {
        // Editing Price - ideally update all docs of this SKU that belong to the user's scope
        for (const comp of FIXED_COMPANIES) {
          if (canEditCompany(comp) && item.docs[comp]) {
            const docToUpdate = item.docs[comp];
            if (docToUpdate[field as keyof StockItem] !== numValue) {
              await onUpdateItem(docToUpdate.id, { [field]: numValue }, "Atualização de Preço", 0);
            }
          }
        }
      }
    } catch (err) {
      alert("Erro ao salvar alteração.");
    }

    setEditingCell(null);
    setLoadingSku("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, item: ConsolidatedItem) => {
    if (e.key === "Enter") {
      handleSaveEdit(item);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <div className="bg-white p-4">
      {/* Pesquisa simples */}
      <div className="mb-4 flex items-center border border-gray-400 p-2 max-w-md">
        <Search size={16} className="text-gray-500 mr-2" />
        <input 
          type="text" 
          placeholder="Pesquisar produto" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full outline-none text-sm text-gray-800"
        />
      </div>

      {/* Planilha Exata */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400 text-sm font-sans text-gray-900">
          <thead className="bg-gray-200 text-center font-bold">
            <tr>
              <th className="border border-gray-400 p-2" rowSpan={2}>CODIGO</th>
              <th className="border border-gray-400 p-2" rowSpan={2}>DESCRIÇÃO</th>
              <th className="border border-gray-400 p-2" colSpan={3}>QUANTIDADE</th>
              <th className="border border-gray-400 p-2" rowSpan={2}>P/ A VISTA</th>
              <th className="border border-gray-400 p-2" rowSpan={2}>P/PRAZO</th>
            </tr>
            <tr>
              {FIXED_COMPANIES.map(comp => (
                <th key={comp} className="border border-gray-400 p-2 min-w-[80px]">{comp}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const isProcessing = loadingSku === item.sku;
              return (
                <tr key={item.sku} className={`hover:bg-gray-50 ${isProcessing ? "opacity-50" : ""}`}>
                  <td className="border border-gray-400 p-2 text-center whitespace-nowrap">{item.sku}</td>
                  <td className="border border-gray-400 p-2 min-w-[250px]">{item.description}</td>
                  
                  {/* Quantity Cells */}
                  {FIXED_COMPANIES.map(comp => {
                    const docItem = item.docs[comp];
                    const qty = docItem ? docItem.quantity : 0;
                    const isEditing = editingCell?.sku === item.sku && editingCell?.field === comp;
                    const editable = canEditCompany(comp);

                    return (
                      <td 
                        key={comp} 
                        className={`border border-gray-400 p-2 text-center ${editable ? "cursor-pointer hover:bg-yellow-50" : "bg-gray-50"}`}
                        onClick={() => editable && startEdit(item, comp, qty.toString())}
                      >
                        {isEditing ? (
                          <input 
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(item)}
                            onKeyDown={(e) => handleKeyDown(e, item)}
                            className="w-full text-center outline-none bg-white border border-blue-400"
                          />
                        ) : (
                          qty || "-"
                        )}
                      </td>
                    );
                  })}

                  {/* Price Cash */}
                  <td 
                    className={`border border-gray-400 p-2 text-center ${(!isVendedor) ? "cursor-pointer hover:bg-yellow-50" : ""}`}
                    onClick={() => startEdit(item, "priceCash", item.priceCash.toString())}
                  >
                    {editingCell?.sku === item.sku && editingCell?.field === "priceCash" ? (
                      <input 
                        autoFocus
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveEdit(item)}
                        onKeyDown={(e) => handleKeyDown(e, item)}
                        className="w-full text-center outline-none bg-white border border-blue-400"
                      />
                    ) : (
                      item.priceCash > 0 ? item.priceCash.toFixed(2).replace(".", ",") : "-"
                    )}
                  </td>

                  {/* Price Installment */}
                  <td 
                    className={`border border-gray-400 p-2 text-center ${(!isVendedor) ? "cursor-pointer hover:bg-yellow-50" : ""}`}
                    onClick={() => startEdit(item, "priceInstallment", item.priceInstallment.toString())}
                  >
                    {editingCell?.sku === item.sku && editingCell?.field === "priceInstallment" ? (
                      <input 
                        autoFocus
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveEdit(item)}
                        onKeyDown={(e) => handleKeyDown(e, item)}
                        className="w-full text-center outline-none bg-white border border-blue-400"
                      />
                    ) : (
                      item.priceInstallment > 0 ? item.priceInstallment.toFixed(2).replace(".", ",") : "-"
                    )}
                  </td>
                </tr>
              );
            })}
            
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={7} className="border border-gray-400 p-4 text-center text-gray-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        * Clique na célula de quantidade ou preço para alterar os valores e pressione Enter (Alimentadores e Admins).
      </div>
    </div>
  );
}
