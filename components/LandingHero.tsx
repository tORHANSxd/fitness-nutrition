"use client";

interface LandingHeroProps {
  onEnter: () => void;
}

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260215_121759_424f8e9c-d8bd-4974-9567-52709dfb6842.mp4";

const navLinks = ["Home", "Services", "Reviews", "Contact us"];

function ChevronDown() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Logoipsum() {
  return (
    <svg width="134" height="25" viewBox="0 0 134 25" fill="none" aria-label="LOGOIPSUM">
      <text x="0" y="19" fontFamily="var(--font-manrope), sans-serif" fontWeight="700" fontSize="20" letterSpacing="0.5" fill="#ffffff">
        LOGOIPSUM
      </text>
    </svg>
  );
}

export function LandingHero({ onEnter }: LandingHeroProps) {
  return (
    <section className="relative w-full overflow-hidden bg-black text-white">
      {/* 背景视频：120% 尺寸、水平居中、焦点贴底，z=0 */}
      <video
        className="pointer-events-none absolute bottom-0 left-1/2 h-[120%] w-[120%] -translate-x-1/2 object-cover"
        style={{ objectPosition: "center bottom", zIndex: 0 }}
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* 模糊黑色 pill：z=1 */}
      <div
        className="pointer-events-none absolute left-1/2 top-[215px] h-[384px] w-[801px] max-w-[92vw] -translate-x-1/2 rounded-full bg-black"
        style={{ filter: "blur(77.5px)", zIndex: 1 }}
      />

      {/* 全部内容 z=2 */}
      <div className="relative" style={{ zIndex: 2 }}>
        {/* Navbar */}
        <nav className="mx-auto flex h-[102px] w-full max-w-[1440px] items-center justify-between px-6 py-4 md:px-12 lg:px-[120px]">
          <div className="flex items-center gap-8 lg:gap-20">
            <Logoipsum />
            <div className="hidden items-center gap-2.5 lg:flex">
              {navLinks.map((item) => (
                <a
                  key={item}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center gap-[3px] px-2.5 py-1 text-sm font-medium leading-[22px] text-white/90 transition-colors hover:text-white"
                  style={{ fontFamily: "var(--font-manrope), sans-serif" }}
                >
                  {item}
                  {item === "Services" ? <ChevronDown /> : null}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onEnter}
              className="rounded-lg border border-[#d4d4d4] bg-white px-4 py-2 text-sm font-semibold leading-[22px] text-[#171717] transition-transform hover:-translate-y-px"
              style={{ fontFamily: "var(--font-manrope), sans-serif" }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="rounded-lg bg-[#7b39fc] px-4 py-2 text-sm font-semibold leading-[22px] text-[#fafafa] transition-transform hover:-translate-y-px"
              style={{ fontFamily: "var(--font-manrope), sans-serif", boxShadow: "0px 4px 16px rgba(23,23,23,0.04)" }}
            >
              Get Started
            </button>
          </div>
        </nav>

        {/* Hero 内容 */}
        <div className="mx-auto mt-[110px] flex w-full max-w-[871px] flex-col items-center gap-6 px-6 lg:mt-[162px]">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <h1
              className="text-white"
              style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 500, fontSize: "clamp(40px,8vw,76px)", letterSpacing: "-2px", lineHeight: 1.15 }}
            >
              Automate repetitive.
            </h1>
            <h1
              className="text-white"
              style={{ fontFamily: "var(--font-instrument), serif", fontStyle: "italic", fontWeight: 400, fontSize: "clamp(40px,8vw,76px)", letterSpacing: "-2px", lineHeight: 1.15 }}
            >
              Focus on growth.
            </h1>
            <p
              className="max-w-[613px] opacity-90"
              style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 400, fontSize: "18px", lineHeight: "26px", color: "#f6f7f9" }}
            >
              The next-generation AI agent platform that handles lead generation, customer support, and data entry while you build.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-wrap items-center justify-center gap-[22px]">
            <button
              type="button"
              onClick={onEnter}
              className="rounded-[10px] bg-[#7b39fc] px-6 py-3.5 text-white transition-transform hover:-translate-y-px"
              style={{ fontFamily: "var(--font-cabin), sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: 1.7 }}
            >
              Get Started Free
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="rounded-[10px] bg-[#2b2344] px-6 py-3.5 transition-transform hover:-translate-y-px"
              style={{ fontFamily: "var(--font-cabin), sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: 1.7, color: "#f6f7f9" }}
            >
              Watch 2min Demo
            </button>
          </div>
        </div>

        {/* Dashboard 图：玻璃拟态外框 */}
        <div className="mt-20 flex justify-center px-4 pb-10">
          <div
            className="w-[1163px] max-w-[90vw] rounded-[24px] border-[1.5px] border-transparent backdrop-blur-[10px]"
            style={{ background: "rgba(255,255,255,0.05)", padding: "22.5px" }}
          >
            <img
              src="https://picsum.photos/seed/agentic-dashboard/1200/720"
              alt="产品仪表盘预览"
              className="h-auto w-full rounded-lg object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
