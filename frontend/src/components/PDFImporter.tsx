import React, { useState, useRef } from "react";
import { FileUp, Loader2, Check, AlertTriangle, Plus, Trash2, Edit2, Play, CircleAlert } from "lucide-react";
import { formatBRL } from "../utils";

interface ExtractedItem {
  virtualId: string;
  brand: string;
  model: string;
  size: string;
  quantity: number;
  price: number;
  notes: string;
  description?: string;
  imageUrl?: string;
}

interface PDFImporterProps {
  onSaveImportedItems: (items: Omit<ExtractedItem, "virtualId">[]) => Promise<void>;
  userEmail: string;
}

export default function PDFImporter({ onSaveImportedItems, userEmail }: PDFImporterProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [success, setSuccess] = useState(false);
  
  // Editing state for table rows
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editQuantity, setEditQuantity] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editNotes, setEditNotes] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError("");
    setSuccess(false);
    
    const isPDF = selectedFile.type === "application/pdf";
    const isImage = selectedFile.type.startsWith("image/");
    
    if (!isPDF && !isImage) {
      setError("Tipo de arquivo inválido. Por favor, envie apenas arquivos PDF ou imagens.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
      setError("O arquivo é muito grande. O limite máximo é de 10MB.");
      return;
    }

    setFile(selectedFile);
    setExtractedItems([]);
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleProcessFile = async () => {
    if (!file) {
      setError("Por favor, selecione um arquivo primeiro.");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const base64Content = await convertToBase64(file);
      
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/api/parse-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileBase64: base64Content,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Erro de rede" }));
        throw new Error(errorData.error || "Não foi possível extrair os dados do arquivo.");
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.items)) {
        // Enforce basic verification structure
        const validated: ExtractedItem[] = data.items.map((item: any, idx: number) => ({
          virtualId: item.virtualId || `PROD-${Date.now()}-${idx}`,
          brand: item.brand || "Desconhecida",
          model: item.model || "Desconhecido",
          size: item.size || "S/M",
          quantity: typeof item.quantity === "number" ? item.quantity : parseInt(item.quantity) || 0,
          price: typeof item.price === "number" ? item.price : parseFloat(item.price) || 0,
          notes: item.notes || "",
          description: item.description || "Importado via análise inteligente de PDF",
          imageUrl: item.imageUrl || ""
        }));
        
        setExtractedItems(validated);
        if (validated.length === 0) {
          setError("Nenhum pneu mapeado no arquivo. Tente um arquivo diferente.");
        }
      } else {
        throw new Error("Resposta inválida do analisador de IA.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de conexão ao processar o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  // Row edit handlers
  const startEdit = (item: ExtractedItem) => {
    setEditingId(item.virtualId);
    setEditBrand(item.brand);
    setEditModel(item.model);
    setEditSize(item.size);
    setEditQuantity(item.quantity);
    setEditPrice(item.price);
    setEditNotes(item.notes);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveRowEdit = (virtualId: string) => {
    setExtractedItems(prev => prev.map(item => {
      if (item.virtualId === virtualId) {
        return {
          ...item,
          brand: editBrand,
          model: editModel,
          size: editSize,
          quantity: editQuantity,
          price: editPrice,
          notes: editNotes
        };
      }
      return item;
    }));
    setEditingId(null);
  };

  const deleteRow = (virtualId: string) => {
    setExtractedItems(prev => prev.filter(item => item.virtualId !== virtualId));
  };

  const addNewPlaceholderRow = () => {
    const newVirtualId = `PROD-NEW-${Date.now()}`;
    const newItem: ExtractedItem = {
      virtualId: newVirtualId,
      brand: "Nova Marca",
      model: "Modelo Pneu",
      size: "205/55R16",
      quantity: 1,
      price: 0,
      notes: ""
    };
    setExtractedItems([newItem, ...extractedItems]);
    startEdit(newItem);
  };

  const handleConfirmImport = async () => {
    if (extractedItems.length === 0) return;
    
    setLoading(true);
    setError("");
    
    try {
      // Remove temporary virtual ID before saving
      const itemsToSave = extractedItems.map(({ brand, model, size, quantity, price, notes, description, imageUrl }) => ({
        brand,
        model,
        size,
        quantity,
        price,
        notes,
        description: description || "Importado via análise inteligente de PDF",
        imageUrl: imageUrl || ""
      }));
      
      await onSaveImportedItems(itemsToSave);
      
      setSuccess(true);
      setExtractedItems([]);
      setFile(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocorreu um erro ao salvar o estoque importado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="pdf-importer-section" className="bg-white p-6 rounded-2xl border-t-4 border-t-gold-500 border-x border-b border-slate-200/85 shadow-[0_10px_25px_rgba(0,0,0,0.015)] space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Importação Inteligente de Pneus via PDF</h2>
          <p className="text-sm text-slate-500 font-semibold mt-1">
            Envie faturas de compras, planilhas salvas em PDF ou fotos de tabelas. Nossa IA extrairá marcas, modelos, medidas, quantidades e preços automaticamente.
          </p>
        </div>
        {extractedItems.length > 0 && (
          <button
            onClick={addNewPlaceholderRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gold-700 bg-gold-50 hover:bg-gold-100 rounded-lg border border-gold-200/50 transition-all self-start cursor-pointer"
          >
            <Plus size={14} /> Adicionar Item Manual
          </button>
        )}
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-xl text-sm flex gap-2.5 items-start">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Atenção!</span>
            {error}
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-4 rounded-xl text-sm flex gap-2.5 items-start animate-fadeIn">
          <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Importação Concluída!</span>
            O estoque extraído do PDF foi integrado à sua conta e as movimentações foram registradas com sucesso.
          </div>
        </div>
      )}

      {/* Drag & Drop Area */}
      {extractedItems.length === 0 && (
        <div className="flex flex-col items-center">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`w-full max-w-2xl border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragActive 
                ? "border-gold-500 bg-gold-50/20 scale-[1.01]" 
                : file 
                  ? "border-gold-400 bg-gold-50/5 hover:bg-gold-50/15" 
                  : "border-slate-200 bg-white hover:border-gold-400 hover:bg-gold-50/10"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileInput}
              className="hidden"
            />
            
            <div className="h-14 w-14 rounded-2xl bg-gold-50 text-gold-600 flex items-center justify-center mb-4 border border-gold-100">
              <FileUp size={28} className={loading ? "animate-pulse" : "text-gold-600"} />
            </div>

            {file ? (
              <div className="space-y-1">
                <p className="font-bold text-slate-850 text-base">{file.name}</p>
                <p className="text-xs text-slate-500 font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB • Pronto para processar</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-bold text-slate-900 text-base">Arraste seu PDF de estoque ou clique para explorar</p>
                <p className="text-xs text-slate-550 font-semibold">Formatos aceitos: PDF ou imagens (PNG, JPG, JPEG) de até 10MB</p>
              </div>
            )}
            
            {/* Visual Guide help */}
            <div className="mt-6 flex gap-4 text-xs text-gold-700/80 border-t border-slate-100 pt-4 w-full justify-center">
              <span>🚘 Pneus de Passeio</span>
              <span>•</span>
              <span>🚚 Carga/Caminhão</span>
              <span>•</span>
              <span>🚲 Motocicleta</span>
            </div>
          </div>

          {/* Action Trigger button */}
          {file && !loading && (
            <button
              onClick={handleProcessFile}
              className="mt-5 flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-gold-600 via-gold-500 to-amber-550 text-white font-extrabold rounded-xl text-sm shadow-md shadow-gold-500/10 hover:shadow-gold-500/20 border border-gold-400/20 transition-all cursor-pointer hover:scale-[1.01]"
            >
              <Play size={16} fill="white" className="stroke-none" /> Processar e Extrair Itens com IA
            </button>
          )}

          {loading && (
            <div className="mt-5 flex flex-col items-center gap-2.5">
              <Loader2 className="animate-spin text-gold-600 h-8 w-8" />
              <p className="text-sm font-bold text-slate-800">A IA do Central Stoque está decifrando e organizando seu arquivo...</p>
              <span className="text-xs text-slate-400 max-w-sm text-center">Isso pode levar alguns segundos dependendo do tamanho das tabelas de pneus no PDF.</span>
            </div>
          )}
        </div>
      )}

      {/* Extracted items checklist/review list */}
      {extractedItems.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-gold-50/30 rounded-xl p-3 border border-gold-200/40 flex items-center gap-2">
            <CircleAlert className="text-gold-600 shrink-0 h-5 w-5" />
            <p className="text-xs text-slate-700 font-semibold">
              <strong>Módulo de Verificação Inteligente:</strong> Por favor, revise os pneus extraídos no seu PDF pelo modelo. Você pode editar marcas, medidas e quantidades clicando em "Editar" antes de registrar permanentemente no estoque.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-250">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-slate-450 text-[10px] uppercase tracking-wider font-extrabold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-black">Marca</th>
                  <th className="py-3 px-4 font-black">Modelo</th>
                  <th className="py-3 px-4 font-black">Medida / Tamanho</th>
                  <th className="py-3 px-4 text-center font-black">Quantidade</th>
                  <th className="py-3 px-4 text-right font-black">Preço Sugerido</th>
                  <th className="py-3 px-4 font-black">Observações</th>
                  <th className="py-3 px-4 text-center font-black">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {extractedItems.map((item) => (
                  <tr key={item.virtualId} className="hover:bg-gold-50/10 text-slate-800 transition-colors">
                    
                    {/* Brand column */}
                    <td className="py-2.5 px-4">
                      {editingId === item.virtualId ? (
                        <input
                          type="text"
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 outline-none"
                        />
                      ) : (
                        <span className="font-bold text-slate-905 uppercase">{item.brand}</span>
                      )}
                    </td>

                    {/* Model column */}
                    <td className="py-2.5 px-4 font-semibold text-slate-650">
                      {editingId === item.virtualId ? (
                        <input
                          type="text"
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 outline-none"
                        />
                      ) : (
                        item.model
                      )}
                    </td>

                    {/* Size column */}
                    <td className="py-2.5 px-4 font-bold text-slate-800 font-mono">
                      {editingId === item.virtualId ? (
                        <input
                          type="text"
                          value={editSize}
                          onChange={(e) => setEditSize(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 outline-none"
                          placeholder="Ex: 205/55R16"
                        />
                      ) : (
                        item.size
                      )}
                    </td>

                    {/* Quantity column */}
                    <td className="py-2.5 px-4 text-center">
                      {editingId === item.virtualId ? (
                        <input
                          type="number"
                          value={editQuantity}
                          min={0}
                          onChange={(e) => setEditQuantity(parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 text-center outline-none"
                        />
                      ) : (
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg border font-black text-xs ${
                          item.quantity > 5 
                            ? "bg-gold-500/10 text-gold-700 border-gold-400/20" 
                            : "bg-amber-100/60 text-amber-800 border-amber-300/30"
                        }`}>
                          {item.quantity} un
                        </span>
                      )}
                    </td>

                    {/* Price column */}
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      {editingId === item.virtualId ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 text-right outline-none"
                        />
                      ) : (
                        item.price > 0 ? formatBRL(item.price) : "—"
                      )}
                    </td>

                    {/* Notes column */}
                    <td className="py-2.5 px-4 text-xs text-slate-500 truncate max-w-[150px]">
                      {editingId === item.virtualId ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gold-300 rounded focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 outline-none"
                          placeholder="Ex: Reforçado / 91V"
                        />
                      ) : (
                        item.notes || <span className="text-slate-300">Sem obs</span>
                      )}
                    </td>

                    {/* Actions column */}
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {editingId === item.virtualId ? (
                          <>
                            <button
                              onClick={() => saveRowEdit(item.virtualId)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Salvar alteração"
                            >
                              <Check size={14} className="stroke-[3px]" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 px-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded"
                              title="Cancelar"
                            >
                              Voltar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1 px-1.5 text-xs font-bold text-gold-700 bg-gold-400/10 hover:bg-gold-400/20 rounded border border-gold-300/30"
                              title="Editar item"
                            >
                              <Edit2 size={11} fill="currentColor" className="stroke-none" />
                            </button>
                            <button
                              onClick={() => deleteRow(item.virtualId)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="Remover item da lista"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Confirm Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-end pt-2">
            <button
              onClick={() => {
                setExtractedItems([]);
                setFile(null);
                setError("");
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-all w-full sm:w-auto text-center cursor-pointer"
            >
              Descartar e Voltar
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={loading || extractedItems.length === 0}
              className="flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-white font-extrabold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-md shadow-emerald-550/10 hover:shadow-emerald-550/20 transition-all w-full sm:w-auto cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" /> Integrando...
                </>
              ) : (
                <>
                  <Check size={16} className="stroke-[3px]" /> Confirmar e Integrar {extractedItems.length} Pneus ao Estoque
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
