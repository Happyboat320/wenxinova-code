import { useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { AuthContext } from "@/contexts/authContext";

export default function Home() {
    const navigate = useNavigate();

    const {
        isDark
    } = useTheme();

    const {
        isAuthenticated,
        user,
        openLogin,
        logout
    } = useContext(AuthContext);

    const appRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (appRef.current) {
            appRef.current.classList.add("fade-in");
        }
    }, []);

    const handleNavigate = (path: string) => {
        navigate(path);
    };

    const containerVariants = {
        hidden: {
            opacity: 0
        },

        visible: {
            opacity: 1,

            transition: {
                staggerChildren: 0.2,
                delayChildren: 0.3
            }
        }
    };

    const itemVariants = {
        hidden: {
            y: 20,
            opacity: 0
        },

        visible: {
            y: 0,
            opacity: 1,

            transition: {
                duration: 0.6,
                ease: "easeOut" as const
            }
        }
    };

    return (
        <div
            ref={appRef}
            className={`min-h-screen min-w-[1440px] flex flex-col items-center justify-center p-8 ${isDark ? "bg-gray-900 text-gray-100" : "bg-[#F9F6F0] text-gray-800"}`}>
            {}
            <header
                className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
                <div className="flex items-center gap-2">
                     <i className="fa-solid fa-book-open text-amber-800 text-2xl"></i>
                <h1 className="text-2xl title-serif">文心新述</h1>
            </div>
                {isAuthenticated ? <div className="flex items-center gap-4">
                    <div
                        className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800">
                        <i className="fa-solid fa-user"></i>
                    </div>
                    <span className="text-sm opacity-70">{user?.phone}</span>
                    <button
                        onClick={logout}
                        className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors">退出
                                            </button>
                </div> : <button
                    onClick={openLogin}
                    className="px-4 py-2 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors">登录
                                    </button>}
            </header>
            {}
            <motion.div
                className="w-full max-w-6xl"
                initial="hidden"
                animate="visible"
                variants={containerVariants}>
                {}
                <motion.div className="text-center mb-16" variants={itemVariants}>
                    <h2 className="text-4xl md:text-5xl title-serif mb-4">智能古典文学改编平台</h2>
                    <p className="text-lg md:text-xl max-w-3xl mx-auto opacity-80">探索古典文学的无限可能，AI助力您创作出独特魅力的现代演绎
                                                          </p>
                </motion.div>
                {}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {}
                    <motion.div
                        className="book-card relative overflow-hidden group"
                        variants={itemVariants}
                        whileHover={{
                            y: -10,

                            transition: {
                                duration: 0.3
                            }
                        }}
                        onClick={() => handleNavigate("/classical-library")}>
                        <div
                            className="absolute top-0 right-0 w-24 h-24 bg-amber-100 rounded-full -translate-y-12 translate-x-12 opacity-70 group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                        <div className="relative z-10">
                            <div className="mb-6 flex justify-center">
                                <div
                                    className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                                    <i className="fa-solid fa-scroll text-amber-800 text-3xl"></i>
                                </div>
                            </div>
                            <h3 className="text-2xl title-serif text-center mb-3">古典文库</h3>
                            <p className="text-center mb-6 opacity-80">浏览四大名著及经典古籍，感受中华文化的博大精深
                                                                              </p>
                            <button className="w-full btn-primary flex items-center justify-center gap-2">
                                <span>开始探索</span>
                                <i className="fa-solid fa-arrow-right"></i>
                            </button>
                        </div>
                    </motion.div>
                    {}
                    <motion.div
                        className="book-card relative overflow-hidden group"
                        variants={itemVariants}
                        whileHover={{
                            y: -10,

                            transition: {
                                duration: 0.3
                            }
                        }}
                        onClick={() => handleNavigate("/ugc-community")}>
                        <div
                            className="absolute top-0 right-0 w-24 h-24 bg-red-100 rounded-full -translate-y-12 translate-x-12 opacity-70 group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                        <div className="relative z-10">
                            <div className="mb-6 flex justify-center">
                                <div
                                    className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                                    <i className="fa-solid fa-users text-red-800 text-3xl"></i>
                                </div>
                            </div>
                            <h3 className="text-2xl title-serif text-center mb-3">UGC社区</h3>
                            <p className="text-center mb-6 opacity-80">分享您的创意改编，发现他人的精彩作品，共同创作经典新篇
                                                                              </p>
                            <button className="w-full btn-primary flex items-center justify-center gap-2">
                                <span>加入社区</span>
                                <i className="fa-solid fa-arrow-right"></i>
                            </button>
                        </div>
                    </motion.div>
                    {}
                    <motion.div
                        className="book-card relative overflow-hidden group"
                        variants={itemVariants}
                        whileHover={{
                            y: -10,

                            transition: {
                                duration: 0.3
                            }
                        }}
                        onClick={() => handleNavigate("/my-collection")}>
                        <div
                            className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-full -translate-y-12 translate-x-12 opacity-70 group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                        <div className="relative z-10">
                            <div className="mb-6 flex justify-center">
                                <div
                                    className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                                    <i className="fa-solid fa-bookmark text-blue-800 text-3xl"></i>
                                </div>
                            </div>
                            <h3 className="text-2xl title-serif text-center mb-3">我的创作</h3>
                            <p className="text-center mb-6 opacity-80">管理您的改编作品，查看收藏的经典片段，继续未完成的创作
                                                                              </p>
                            <button className="w-full btn-primary flex items-center justify-center gap-2">
                                <span>我的作品</span>
                                <i className="fa-solid fa-arrow-right"></i>
                            </button>
                        </div>
                    </motion.div>
                </div>
                {}
                <motion.div
                    className="mt-24 grid grid-cols-1 md:grid-cols-2 gap-12"
                    variants={itemVariants}>
                    <div
                        className="bg-white bg-opacity-80 backdrop-blur-sm rounded-2xl p-8 shadow-lg">
                        <h3 className="text-2xl title-serif mb-4">智能改编特色</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <div
                                    className="mt-1 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <i className="fa-solid fa-language text-amber-800"></i>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-1">高保真文白转换</h4>
                                    <p className="text-sm opacity-80">确保翻译后的白话文流畅且不失原文神韵</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <div
                                    className="mt-1 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <i className="fa-solid fa-paint-brush text-red-800"></i>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-1">可控的风格化改编</h4>
                                    <p className="text-sm opacity-80">实现用户指定风格（如悬疑、喜剧）的稳定输出</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <div
                                    className="mt-1 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <i className="fa-solid fa-mask text-blue-800"></i>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-1">分角色单视角故事</h4>
                                    <p className="text-sm opacity-80">生成符合人物叙述视角的限知故事，提升阅读沉浸感</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <div
                                    className="mt-1 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <i className="fa-solid fa-random text-green-800"></i>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-1">符合逻辑的分支情节</h4>
                                    <p className="text-sm opacity-80">生成既出人意料又合乎原作文本逻辑的新情节</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="relative">
                            <motion.div
                                className="w-64 h-64 bg-amber-100 rounded-full opacity-50 absolute -top-10 -right-10 floating"
                                animate={{
                                    scale: [1, 1.1, 1],
                                    opacity: [0.5, 0.7, 0.5]
                                }}
                                transition={{
                                    duration: 6,
                                    repeat: Infinity
                                }} />
                            <motion.div
                                className="w-96 h-96 bg-red-100 rounded-full opacity-30 absolute -bottom-10 -left-10 floating"
                                animate={{
                                    scale: [1, 1.2, 1],
                                    opacity: [0.3, 0.5, 0.3]
                                }}
                                transition={{
                                    duration: 8,
                                    repeat: Infinity,
                                    delay: 1
                                }} />
                            <img
                                src="https://space.coze.cn/api/coze_space/gen_image?image_size=landscape_4_3&prompt=chinese%20ancient%20scroll%20with%20calligraphy%20and%20painting%20art&sign=dc6a09330f9f8db14739b4c78d0105fb"
                                alt="古籍展示"
                                className="w-full h-auto rounded-xl shadow-2xl relative z-10 transform rotate-2 book-shadow" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>
            {}
             <footer
                className="absolute bottom-0 left-0 right-0 p-6 text-center text-sm opacity-70">
                <p>© 2025 文心新述 - 古典小说智能改编平台 | 以科技传承文化经典</p>
            </footer>
            {}
        </div>
    );
}
