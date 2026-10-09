import { memo, useContext, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { AuthContext } from "@/contexts/authContext";
import SiteHeader from "@/components/SiteHeader";

const coverOrbits = [
    {
        depth: 1,
        radius: "-45vw",
        duration: 420,
        angleOffset: -8,
        files: [
            "唐宋传奇集封面 (2).png", "唐宋传奇.png", "三言封面.png", "二拍封面2.png",
            "宋元明话本.png", "唐五代笔记小说.png", "封面.png", "明代笔记小说.png", "宋元小说话本.png",
            "官场现形记.png", "临川四梦封面.png", "李渔全集封面.png", "明清传奇.png",
            "新刻绣像批评金瓶梅封面.png", "金瓶梅封面.png"
        ]
    },
    {
        depth: 2,
        radius: "-33vw",
        duration: 365,
        angleOffset: 116,
        reverse: true,
        files: [
            "孤本小说集.png", "唐宋传奇集封面.png", "二拍封面.png", "三言封面3.png", "宋元笔记小说.png",
            "唐五代志怪传奇序录封面.png", "清平山堂话本.png", "太平广记封面.png",
            "玉娇梨4.png", "搜神记.png",
            "三言二拍封面.png", "唐宋传奇总集目录（这本我们可能没有但可以借用封面？）.png"
        ]
    },
    {
        depth: 3,
        radius: "-22vw",
        duration: 315,
        angleOffset: 238,
        denseStep: 3,
        denseLimit: 5,
        files: [
            "汉魏六朝笔记小说.png", "唐宋传奇选封面.png", "清代笔记小说.png",
            "官场现形记 (2).png", "金瓶梅2.png", "大宋中兴通俗演义封面.png",
            "李渔全集2.png", "三言（警世通言 喻世明言 醒世恒言 ）.png",
            "唐五代传奇集封面.png", "玉娇梨2.png", "玉娇梨封面.png", "玉娇梨3.png"
        ]
    }
] as const;

const coverAliases: Record<string, string> = {};

const buildDenseOrbit = (files: readonly string[], step: number, limit = Infinity) => files.flatMap((file, index, orbitFiles) => {
    const insertedCount = Math.floor(index / step);
    if (index % step !== 0 || insertedCount >= limit) return [file];
    return [file, orbitFiles[(index + Math.ceil(orbitFiles.length / 2)) % orbitFiles.length]];
});

const CoverOrbit = memo(function CoverOrbit({
    files,
    radius,
    duration,
    depth,
    angleOffset = 0,
    reverse = false,
    denseStep = 2,
    denseLimit = Infinity,
}: {
    files: readonly string[];
    radius: string;
    duration: number;
    depth: 1 | 2 | 3;
    angleOffset?: number;
    reverse?: boolean;
    denseStep?: number;
    denseLimit?: number;
}) {
    const orbitFiles = buildDenseOrbit(files, denseStep, denseLimit);
    return (
        <ul className={`home-cover-orbit depth-${depth}${reverse ? " is-reverse" : ""}`} style={{ "--orbit-duration": `${duration}s` } as CSSProperties}>
            {orbitFiles.map((_, index) => (
                <li key={`${depth}-bead-${index}`} className="home-cover-bead-position" style={{ "--cover-angle": `${angleOffset + (index + 0.5) * 360 / orbitFiles.length}deg`, "--cover-radius": radius } as CSSProperties}>
                    <span className="home-orbit-bead" />
                </li>
            ))}
            {orbitFiles.map((file, index) => (
                <li
                    key={`${depth}-${index}-${file}`}
                    className="home-cover-position"
                    style={{ "--cover-angle": `${angleOffset + index * 360 / orbitFiles.length}deg`, "--cover-radius": radius } as CSSProperties}
                >
                    <span className="home-cover-float" style={{ "--float-delay": `${-index * 0.43}s` } as CSSProperties}>
                        <img
                            src={`/home-cover-thumbs/${encodeURIComponent((coverAliases[file] || file).replace(/\.png$/i, '.webp'))}?v=20260916`}
                            alt=""
                            decoding="async"
                            fetchPriority="low"
                            draggable={false}
                        />
                    </span>
                </li>
            ))}
        </ul>
    );
});

const HomeBackground = memo(function HomeBackground({ showCovers }: { showCovers: boolean }) {
    return (
        <div className="home-orbit-background" aria-hidden="true">
            <div className="home-paper-texture" />
            <div className="home-concentric-disc">
                <div className="home-disc-rings" />
                <div className="home-depth-ring ring-1" />
                <div className="home-depth-ring ring-2" />
                <div className="home-depth-ring ring-3" />
                {showCovers && coverOrbits.map((orbit) => (
                    <CoverOrbit
                        key={orbit.depth}
                        files={orbit.files}
                        radius={orbit.radius}
                        duration={orbit.duration}
                        depth={orbit.depth}
                        angleOffset={orbit.angleOffset}
                        reverse={"reverse" in orbit ? orbit.reverse : false}
                        denseStep={"denseStep" in orbit ? orbit.denseStep : 2}
                        denseLimit={"denseLimit" in orbit ? orbit.denseLimit : Infinity}
                    />
                ))}
            </div>
        </div>
    );
});

const featureItems = [
    ["bg-amber-100", "fa-language", "text-amber-800", "高保真文白转换", "确保翻译后的白话文流畅且不失原文神韵"],
    ["bg-red-100", "fa-paint-brush", "text-red-800", "可控的风格化改编", "实现用户指定风格（如悬疑、喜剧）的稳定输出"],
    ["bg-blue-100", "fa-diagram-project", "text-blue-800", "图谱化原典理解", "梳理人物关系、事件脉络与文本依据，让每次改编都有清晰根基"],
    ["bg-green-100", "fa-masks-theater", "text-green-800", "跨角色数字共演", "把经典角色带入同一场景，在人设一致的对话中碰撞出新故事"]
];

export default function Home() {
    const navigate = useNavigate();
    const { isDark } = useTheme();
    const { isAuthenticated, user, openLogin, logout } = useContext(AuthContext);
    const appRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLElement>(null);
    const shouldReduceMotion = useReducedMotion();
    const [showOrbitCovers, setShowOrbitCovers] = useState(() => window.matchMedia('(min-width: 768px)').matches);
    const [searchInput, setSearchInput] = useState('');

    useEffect(() => { appRef.current?.classList.add("fade-in"); }, []);

    useEffect(() => {
        const desktopQuery = window.matchMedia('(min-width: 768px)');
        const updateCoverVisibility = () => setShowOrbitCovers(desktopQuery.matches);
        desktopQuery.addEventListener('change', updateCoverVisibility);
        return () => desktopQuery.removeEventListener('change', updateCoverVisibility);
    }, []);

    useEffect(() => {
        const updateAnimationState = () => appRef.current?.classList.toggle('home-orbit-paused', document.hidden);
        updateAnimationState();
        document.addEventListener('visibilitychange', updateAnimationState);
        return () => document.removeEventListener('visibilitychange', updateAnimationState);
    }, []);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.2, delayChildren: 0.3 } }
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" as const } }
    };

    const cards = [
        { path: "/classical-library", accent: "bg-amber-100", icon: "fa-scroll text-amber-800", title: "古典文库", description: "浏览四大名著及经典古籍，感受中华文化的博大精深", action: "开始探索" },
        { path: "/digital-coplay", accent: "bg-green-100", icon: "fa-masks-theater text-green-800", title: "数字共演", description: "从收藏夹选择多个角色，编排顺序并设定场景，让他们轮流对话", action: "开始共演" },
        { path: "/ugc-community", accent: "bg-red-100", icon: "fa-users text-red-800", title: "UGC社区", description: "分享您的创意改编，发现他人的精彩作品，共同创作经典新篇", action: "加入社区" },
        { path: "/my-collection", accent: "bg-blue-100", icon: "fa-bookmark text-blue-800", title: "我的创作", description: "管理您的改编作品，查看收藏的经典片段，继续未完成的创作", action: "我的作品" }
    ];

    const scrollToSection = (section: HTMLElement | null) => {
        section?.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "start" });
    };

    const submitLibrarySearch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const query = searchInput.trim();
        // 通过 URL 传递关键词，进入文库后可立即检索，刷新页面也能保留条件。
        navigate(query ? `/classical-library?q=${encodeURIComponent(query)}` : '/classical-library');
    };

    return (
        <div ref={appRef} className={`home-orbit-page h-screen ${isDark ? "text-gray-100" : "text-gray-800"}`}>
            <HomeBackground showCovers={showOrbitCovers} />
            <SiteHeader
                className="home-site-header home-foreground fixed left-0 right-0 top-0 p-6"
                beforeNavigation={isAuthenticated ? <div className="flex items-center gap-2 sm:gap-4">
                    <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-amber-50" aria-label="编辑个人资料">
                        <span className="w-9 h-9 overflow-hidden rounded-full bg-amber-200 flex items-center justify-center text-amber-800">
                            {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : (user?.nickname?.charAt(0) || <i className="fa-solid fa-user" />)}
                        </span>
                        <span className="max-w-32 truncate text-sm opacity-70">{user?.nickname || '未设置昵称'}</span>
                    </button>
                    <button onClick={logout} className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition-colors hover:bg-gray-300">退出</button>
                </div> : <button onClick={openLogin} className="min-h-11 rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-amber-900 transition-colors hover:bg-amber-200">登录</button>}
            />

            <section className="home-scroll-section home-hero-section">
                <motion.div className="home-foreground home-hero-panel w-full max-w-6xl text-center" initial="hidden" animate="visible" variants={containerVariants}>
                    <motion.p className="home-hero-kicker" variants={itemVariants}>古典新生 · 智启文心</motion.p>
                    <motion.h2 className="home-hero-title title-serif" variants={itemVariants}>智能古典文学改编平台</motion.h2>
                    <motion.p className="home-hero-copy" variants={itemVariants}>探索古典文学的无限可能，AI 助力您创作独具魅力的现代演绎</motion.p>
                    <motion.form className="home-search-shell" variants={itemVariants} onSubmit={submitLibrarySearch} role="search">
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={event => setSearchInput(event.target.value)}
                            maxLength={100}
                            aria-label="检索标题、作者或梗概"
                            placeholder="检索标题、作者或梗概"
                        />
                        <button type="submit" aria-label="检索古典文库">检索</button>
                    </motion.form>
                </motion.div>
                <motion.button
                    type="button"
                    className="home-scroll-cue home-foreground"
                    onClick={() => scrollToSection(cardsRef.current)}
                    aria-label="向下查看核心功能"
                    animate={shouldReduceMotion ? undefined : { y: [0, 9, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                >
                    <span>向下探索</span>
                    <i className="fa-solid fa-chevron-down" />
                </motion.button>
            </section>

            <section ref={cardsRef} className="home-scroll-section home-cards-section">
                <motion.div
                    className="home-foreground w-full max-w-6xl"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.35 }}
                    variants={containerVariants}
                >
                    <motion.div className="home-section-heading" variants={itemVariants}>
                        <p>CORE FUNCTIONS</p>
                        <h2 className="title-serif">四大核心功能</h2>
                        <span>从典籍阅读，到灵感创作，再到作品沉淀</span>
                    </motion.div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {cards.map((card) => <motion.div
                        key={card.path}
                        className="book-card home-function-card relative flex overflow-hidden group"
                        variants={itemVariants}
                        whileHover={{ y: -10, transition: { duration: 0.3 } }}
                        onClick={() => navigate(card.path)}
                    >
                        <div className={`absolute top-0 right-0 w-24 h-24 ${card.accent} rounded-full -translate-y-12 translate-x-12 opacity-70 group-hover:scale-150 transition-transform duration-700 ease-out`} />
                        <div className="relative z-10 flex h-full w-full flex-col">
                            <div className="mb-6 flex justify-center"><div className={`w-20 h-20 rounded-full ${card.accent} flex items-center justify-center`}><i className={`fa-solid ${card.icon} text-3xl`} /></div></div>
                            <h3 className="text-2xl title-serif text-center mb-3">{card.title}</h3>
                            <p className="text-center mb-6 flex-1 opacity-80">{card.description}</p>
                            <button className="h-10 w-full btn-primary flex items-center justify-center gap-2"><span>{card.action}</span><i className="fa-solid fa-arrow-right" /></button>
                        </div>
                    </motion.div>)}
                    </div>
                </motion.div>
            </section>

            <section className="home-scroll-section home-features-section">
                <motion.div
                    className="home-foreground w-full max-w-6xl"
                    initial={{ opacity: 0, y: 56 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <div className="home-section-heading">
                        <p>INTELLIGENT ADAPTATION</p>
                        <h2 className="title-serif">智能改编特色</h2>
                        <span>让技术理解古典，也让创作保有温度</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="home-feature-card bg-white bg-opacity-80 backdrop-blur-sm rounded-2xl p-8 shadow-lg">
                        <ul className="space-y-4">
                            {featureItems.map(([bg, icon, color, title, text], index) => <motion.li
                                key={title}
                                className="flex items-start gap-3"
                                initial={{ opacity: 0, x: -24 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.45, delay: index * 0.12 }}
                            >
                                <div className={`mt-1 w-8 h-8 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}><i className={`fa-solid ${icon} ${color}`} /></div>
                                <div><h4 className="font-medium mb-1">{title}</h4><p className="text-sm opacity-80">{text}</p></div>
                            </motion.li>)}
                        </ul>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="relative">
                            <motion.div className="w-64 h-64 bg-amber-100 rounded-full opacity-50 absolute -top-10 -right-10" animate={shouldReduceMotion ? undefined : { scale: [1, 1.1, 1], opacity: [0.5, 0.7, 0.5] }} transition={{ duration: 6, repeat: Infinity }} />
                            <motion.div className="w-96 h-96 bg-red-100 rounded-full opacity-30 absolute -bottom-10 -left-10" animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 8, repeat: Infinity, delay: 1 }} />
                            <img src="https://space.coze.cn/api/coze_space/gen_image?image_size=landscape_4_3&prompt=chinese%20ancient%20scroll%20with%20calligraphy%20and%20painting%20art&sign=dc6a09330f9f8db14739b4c78d0105fb" alt="古籍展示" className="w-full h-auto rounded-xl shadow-2xl relative z-10 transform rotate-2 book-shadow" />
                        </div>
                    </div>
                    </div>
                </motion.div>

            </section>

            {/* 页脚独立于特色区，手机端不会成为该区横向布局中的一列。 */}
            <footer className="home-footer home-foreground text-center text-sm opacity-70">
                <p>© 2026 文心新述 - 古典小说智能改编平台 | 以科技传承文化经典</p>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                    <a href="https://beian.miit.gov.cn" target="_blank" rel="noreferrer">粤ICP备2026132405号-1</a>
                    <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44060502004803" rel="noreferrer" target="_blank" className="inline-flex items-center gap-1">
                        <img src="/images/beian-icon.png" alt="公安备案图标" width={18} height={20} className="shrink-0" />
                        <span>粤公网安备44060502004803号</span>
                    </a>
                </div>
            </footer>
        </div>
    );
}
