import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  useKnowledgeFiles,
  useKnowledgeFile,
  useSaveKnowledgeFile,
  useDeleteKnowledgeFile,
} from "../api/hooks";

const FILENAME_REGEX = /^[a-z0-9-]+$/;

export default function KnowledgeBasePage() {
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [editContent, setEditContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: filesData, isLoading } = useKnowledgeFiles();
  const { data: fileData } = useKnowledgeFile(selectedFile);
  const saveMutation = useSaveKnowledgeFile();
  const deleteMutation = useDeleteKnowledgeFile();

  const files = filesData?.files ?? [];

  const handleSelectFile = (name: string) => {
    setSelectedFile(name);
    setIsEditing(false);
  };

  const handleEdit = () => {
    if (fileData) {
      setEditContent(fileData.content);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (!selectedFile) return;
    saveMutation.mutate(
      { filename: selectedFile, content: editContent },
      {
        onSuccess: () => {
          toast.success("Dosya kaydedildi");
          setIsEditing(false);
        },
        onError: (err) => toast.error(`Hata: ${(err as Error).message}`),
      },
    );
  };

  const handleCreateNew = () => {
    if (!newFileName || !FILENAME_REGEX.test(newFileName)) {
      toast.error("Dosya adi sadece kucuk harf, rakam ve tire icermelidir");
      return;
    }
    const filename = `${newFileName}.md`;
    saveMutation.mutate(
      { filename, content: `# ${newFileName.replace(/-/g, " ")}\n\nIcerik buraya yazilacak.\n` },
      {
        onSuccess: () => {
          toast.success("Dosya olusturuldu");
          setNewFileName("");
          setShowNewForm(false);
          setSelectedFile(filename);
          setIsEditing(true);
        },
        onError: (err) => toast.error(`Hata: ${(err as Error).message}`),
      },
    );
  };

  const handleDelete = (name: string) => {
    if (!window.confirm(`"${name}" dosyasini silmek istediginize emin misiniz?`)) return;
    deleteMutation.mutate(name, {
      onSuccess: () => {
        toast.success("Dosya silindi");
        if (selectedFile === name) {
          setSelectedFile("");
          setIsEditing(false);
        }
      },
      onError: (err) => toast.error(`Hata: ${(err as Error).message}`),
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="grid grid-cols-12 gap-6">
        {/* File List */}
        <div className="col-span-12 xl:col-span-4">
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <h4 className="text-lg font-semibold text-black dark:text-white">Dosyalar</h4>
              <button
                onClick={() => setShowNewForm(!showNewForm)}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-opacity-90"
              >
                + Yeni
              </button>
            </div>

            {showNewForm && (
              <div className="border-b border-stroke px-6 py-3 dark:border-strokedark">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value.toLowerCase())}
                    placeholder="dosya-adi"
                    className="flex-1 rounded border border-stroke bg-gray px-3 py-1.5 text-sm text-black dark:border-strokedark dark:bg-meta-4 dark:text-white"
                  />
                  <span className="flex items-center text-sm text-bodydark2">.md</span>
                  <button
                    onClick={handleCreateNew}
                    disabled={saveMutation.isPending}
                    className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                  >
                    Olustur
                  </button>
                </div>
              </div>
            )}

            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {isLoading ? (
                <p className="px-6 py-4 text-sm text-bodydark2">Yukleniyor...</p>
              ) : files.length === 0 ? (
                <p className="px-6 py-4 text-sm text-bodydark2">Henuz dosya yok. &quot;+ Yeni&quot; ile olusturun.</p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.name}
                    className={`flex items-center justify-between border-b border-stroke px-6 py-3 last:border-b-0 dark:border-strokedark ${
                      selectedFile === file.name ? "bg-gray-2 dark:bg-meta-4" : "hover:bg-gray-1 dark:hover:bg-meta-4/50"
                    }`}
                  >
                    <button
                      onClick={() => handleSelectFile(file.name)}
                      className="flex-1 text-left"
                    >
                      <span className="block text-sm font-medium text-black dark:text-white">{file.name}</span>
                      <span className="text-xs text-bodydark2">{formatSize(file.size)}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(file.name)}
                      className="ml-2 text-xs text-red-500 hover:text-red-700"
                    >
                      Sil
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="col-span-12 xl:col-span-8">
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <h4 className="text-lg font-semibold text-black dark:text-white">
                {selectedFile || "Dosya secin"}
              </h4>
              {selectedFile && !isEditing && (
                <button
                  onClick={handleEdit}
                  className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90"
                >
                  Duzenle
                </button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="rounded border border-stroke px-4 py-1.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4"
                  >
                    Iptal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              )}
            </div>
            <div className="p-6">
              {!selectedFile ? (
                <div className="space-y-6">
                  {/* Hero */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 dark:bg-primary/10">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-black dark:text-white">Knowledge Base</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-bodydark2">
                      Bu dosyalar, AI asistanın müşteri sorularına cevap verirken kullandığı bilgi temelidir.
                      Her dosya Markdown formatında yazılır ve chat sırasında otomatik olarak modele enjekte edilir.
                    </p>
                  </div>

                  {/* How it works */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[#dcfce7] text-sm font-bold text-[#166534]">1</div>
                      <h4 className="mb-1 text-sm font-semibold text-black dark:text-white">Bilgi Dosyaları</h4>
                      <p className="text-xs leading-relaxed text-bodydark2">
                        Hizmetler, fiyatlandırma, SSS, referanslar gibi dosyalar asistanın bildiği konuları belirler.
                      </p>
                    </div>
                    <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[#dcfce7] text-sm font-bold text-[#166534]">2</div>
                      <h4 className="mb-1 text-sm font-semibold text-black dark:text-white">System Prompt</h4>
                      <p className="text-xs leading-relaxed text-bodydark2">
                        <strong>system-prompt.md</strong> dosyası asistanın kişiliği, kuralları ve davranış talimatlarını içerir.
                      </p>
                    </div>
                    <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[#fef3c7] text-sm font-bold text-[#92400e]">!</div>
                      <h4 className="mb-1 text-sm font-semibold text-black dark:text-white">Anında Etkili</h4>
                      <p className="text-xs leading-relaxed text-bodydark2">
                        Dosyaları düzenleyip kaydettiğinizde değişiklik anında etkili olur. Deploy veya restart gerekmez.
                      </p>
                    </div>
                    <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[#fef3c7] text-sm font-bold text-[#92400e]">~</div>
                      <h4 className="mb-1 text-sm font-semibold text-black dark:text-white">Boyut Limiti</h4>
                      <p className="text-xs leading-relaxed text-bodydark2">
                        Tüm dosyaların toplam boyutu 50.000 karakteri aşmamalıdır. Aşarsa son dosyalar kesilir.
                      </p>
                    </div>
                  </div>

                  {/* File descriptions */}
                  <div className="rounded-lg border border-stroke p-4 dark:border-strokedark">
                    <h4 className="mb-3 text-sm font-semibold text-black dark:text-white">Dosya Rehberi</h4>
                    <div className="space-y-2 text-xs text-bodydark2">
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">system-prompt.md</span>
                        <span>Asistanın kişiliği, kuralları, yasakları ve davranış talimatları</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">services.md</span>
                        <span>Sunulan hizmetlerin detaylı açıklamaları</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">pricing.md</span>
                        <span>Paketler, fiyat aralıkları, ödeme planları</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">faq.md</span>
                        <span>Sık sorulan sorular ve standart cevaplar</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">technologies.md</span>
                        <span>Kullanılan teknoloji stack&apos;i</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">process.md</span>
                        <span>Çalışma süreci, fazlar, teslim adımları</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">references.md</span>
                        <span>Referans projeler ve sektörel deneyim</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-36 shrink-0 font-medium text-black dark:text-white">about.md</span>
                        <span>Firma bilgileri, iletişim, rakamlar</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="h-[calc(100vh-340px)] w-full rounded border border-stroke bg-gray p-4 font-mono text-sm text-black focus:border-primary focus-visible:outline-none dark:border-strokedark dark:bg-meta-4 dark:text-white"
                />
              ) : (
                <pre className="h-[calc(100vh-340px)] overflow-auto whitespace-pre-wrap rounded bg-gray p-4 font-mono text-sm text-black dark:bg-meta-4 dark:text-white">
                  {fileData?.content ?? "Yukleniyor..."}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
