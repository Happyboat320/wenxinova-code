import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";
import * as api from "@/api";
import { AuthContext } from '@/contexts/authContext';

interface BookData {
  id: number;
  title: string;
  author: string;
  content: string;
  annotations: string[];
}

const BookViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, openLogin } = useContext(AuthContext);

  const bookId = parseInt(id || "1");
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'original' | 'annotated' | 'translation' | 'adapt'>('original');

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');
    if (tab && ['original', 'annotated', 'translation', 'adapt'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  // Translation states
  const [translation, setTranslation] = useState<string>('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [qaInput, setQaInput] = useState('');
  const [qaResponse, setQaResponse] = useState<string>('');
  const [qaLoading, setQaLoading] = useState(false);

  // Adapt states
  const [adaptInput, setAdaptInput] = useState('');
  const [adaptResponse, setAdaptResponse] = useState<string>('');
  const [adaptType, setAdaptType] = useState<'adapt' | 'creative' | 'script' | 'custom'>('adapt');
  const [adaptLoading, setAdaptLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadBookData = async () => {
      try {
        setLoading(true);
        const data = await api.getBookContent(bookId);
        setBookData({
          id: bookId,
          title: data.title || "未知书籍",
          author: data.author || "未知作者",
          content: data.content || "",
          annotations: data.annotations || []
        });
      } catch (err) {
        console.error("加载书籍数据失败:", err);
        setError("加载书籍数据失败");
      } finally {
        setLoading(false);
      }
    };

    loadBookData();
  }, [bookId]);

  const loadTranslation = async () => {
    if (!user) {
      toast.error('请先登录后使用 AI 翻译');
      openLogin();
      return;
    }
    try {
      setTranslationLoading(true);
      const translationText = await api.getBookTranslation(bookId);
      setTranslation(translationText);
    } catch (err) {
      console.error("加载译文失败:", err);
      toast.error("加载译文失败");
    } finally {
      setTranslationLoading(false);
    }
  };

  const handleQA = async () => {
    if (!qaInput.trim() || !translation) return;
    if (!user) {
      openLogin();
      return;
    }

    try {
      setQaLoading(true);
      const response = await api.adaptBook(translation, 'custom', `请回答关于这篇译文的问题：${qaInput}`);
      setQaResponse(response);
    } catch (err) {
      console.error("问答失败:", err);
      toast.error("问答失败");
    } finally {
      setQaLoading(false);
    }
  };

  const handleAdapt = async () => {
    if (!adaptInput.trim() || !translation) return;
    if (!user) {
      openLogin();
      return;
    }

    try {
      setAdaptLoading(true);
      const response = await api.adaptBook(translation, adaptType, adaptInput);
      setAdaptResponse(response);
    } catch (err) {
      console.error("改编失败:", err);
      toast.error("改编失败");
    } finally {
      setAdaptLoading(false);
    }
  };

  const handleSaveCreation = async () => {
    if (!user) {
      toast.error('请先登录后保存创作');
      openLogin();
      return;
    }
    if (!adaptResponse) return;

    try {
      setSaving(true);
      await api.saveCreation({
        bookId,
        prompt: `[${adaptType}] ${adaptInput}`,
        content: adaptResponse,
      });
      toast.success('已保存到“我的创作”，并展示在社区');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderAnnotatedText = (text: string, annotations: string[], showAnnotations: boolean = true) => {
    if (!showAnnotations) {
      // For original text, remove all annotation markers \[n\] (including backslashes)
      return text.replace(/\\?\[(\d+)\]/g, '');
    }

    // For annotated text, remove escape characters \ before [n] and render annotations
    const cleanedText = text.replace(/\\\[(\d+)\]/g, '[$1]');
    const parts = cleanedText.split(/(\[\d+\])/);
    return parts.map((part, index) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const annotationIndex = parseInt(match[1]) - 1;
        const annotation = annotations[annotationIndex];
        return (
          <span key={index} className="relative inline-block group">
            <sup className="text-xs text-amber-600 cursor-pointer hover:text-amber-800 font-semibold">
              [{match[1]}]
            </sup>
            {annotation && (
                <div
                    className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2
                            inline-block p-4 bg-gradient-to-b from-amber-50 to-amber-100
                            border-2 border-amber-300 rounded-xl shadow-xl text-sm
                            whitespace-normal break-words
                            z-10 opacity-0 group-hover:opacity-100
                            transition-all duration-300 ease-in-out pointer-events-none"
                    style={{ maxWidth: "10em" }}  // 大约 10 个汉字宽
                >
                    <div className="text-amber-900 font-medium leading-relaxed">
                    {annotation}
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-amber-300" />
                </div>
            )}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">加载中...</div>
      </div>
    );
  }

  if (error || !bookData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-500">{error || "书籍不存在"}</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      {/* Header */}
      <header className="mb-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/classical-library')}
            className="text-amber-600 hover:text-amber-800"
          >
            ← 返回文库
          </button>
          <h1 className="text-2xl font-bold">{bookData.title}</h1>
          <span className="text-sm opacity-70">作者：{bookData.author}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'original', label: '原文' },
            { key: 'annotated', label: '原文+注释' },
            { key: 'translation', label: '译文' },
            { key: 'adapt', label: '改编' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-gray-600 hover:text-amber-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={`rounded-xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg min-h-[600px]`}>
        {activeTab === 'original' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">原文</h2>
            <div className="whitespace-pre-wrap leading-relaxed text-lg">
              {renderAnnotatedText(bookData.content, bookData.annotations, false)}
            </div>
          </div>
        )}

        {activeTab === 'annotated' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">原文+注释</h2>
            <div className="whitespace-pre-wrap leading-relaxed text-lg">
              {renderAnnotatedText(bookData.content, bookData.annotations)}
            </div>
          </div>
        )}

        {activeTab === 'translation' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Translation */}
            <div>
              <h2 className="text-xl font-semibold mb-4">译文</h2>
              <p className="mb-4 text-sm opacity-70">译文由系统统一生成并缓存，无需重复设置翻译提示词。</p>
              <button
                onClick={loadTranslation}
                disabled={translationLoading}
                className="mb-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {translationLoading ? '加载中...' : '加载译文'}
              </button>
              <div className="whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto border rounded p-4">
                {translation || '点击加载译文...'}
              </div>
            </div>

            {/* Right: QA - spans 2 columns */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">问答</h2>
              <p className="text-sm opacity-70 mb-4">在这里可以问关于这篇译文的问题</p>
              <div className="space-y-4">
                <textarea
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder="输入您的问题..."
                  className="w-full p-3 border rounded resize-none"
                  rows={8}
                  cols={30}
                />
                <button
                  onClick={handleQA}
                  disabled={!qaInput.trim() || !translation || qaLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {qaLoading ? '生成中...' : '发送'}
                </button>
                {qaResponse && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                    <h3 className="font-medium mb-2">回答：</h3>
                    <p className="whitespace-pre-wrap">{qaResponse}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'adapt' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Translation */}
            <div>
              <h2 className="text-xl font-semibold mb-4">译文</h2>
              <div className="whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto border rounded p-4">
                {translation || '请先在译文选项卡中加载译文...'}
              </div>
            </div>

            {/* Right: Adapt - spans 2 columns */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">改编</h2>
              <p className="text-sm opacity-70 mb-4">选择处理模式并输入具体要求</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    ['adapt', '风格改编'],
                    ['creative', '续写创作'],
                    ['script', '角色剧本'],
                    ['custom', '自定义'],
                  ] as const).map(([type, label]) => (
                    <button
                      key={type}
                      onClick={() => setAdaptType(type)}
                      className={`px-3 py-2 rounded border ${adaptType === type ? 'bg-amber-700 text-white border-amber-700' : 'border-amber-200 hover:bg-amber-50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={adaptInput}
                  onChange={(e) => setAdaptInput(e.target.value)}
                  placeholder={adaptType === 'script' ? '输入需要生成剧本的角色名...' : '输入具体处理要求...'}
                  className="w-full p-3 border rounded resize-none"
                  rows={10}
                  cols={30}
                />
                <button
                  onClick={handleAdapt}
                  disabled={!adaptInput.trim() || !translation || adaptLoading}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {adaptLoading ? '生成中...' : '开始生成'}
                </button>
                {adaptResponse && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
                    <h3 className="font-medium mb-2">改编结果：</h3>
                    <p className="whitespace-pre-wrap mb-4">{adaptResponse}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveCreation}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? '保存中...' : '保存并发布到社区'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookViewPage;
