"use client";

import { BookOpen, Check, ChevronRight, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { TUTORIAL_EVENT, TUTORIAL_VERSION, tutorialChapters, type TutorialStep } from "@/lib/tutorial";
import { loadTutorialPreferences, saveTutorialPreferences } from "@/lib/tutorialStorage";

const TutorialContext = createContext<(() => void) | null>(null);
export function TutorialButton({ compact = false }: { compact?: boolean }) {
  const open = useContext(TutorialContext);
  return <button type="button" className={compact ? "icon-button" : "app-utility-button"} aria-label="查看教程" onClick={() => open?.()}>
    <BookOpen size={18} />{!compact && "查看教程"}
  </button>;
}

export function TutorialProvider({ user, ready, children }: { user: User; ready: boolean; children: ReactNode }) {
  // Keyed by account: late responses from a previous account cannot open a tour here.
  return <AccountTutorial key={user.id} user={user} ready={ready}>{children}</AccountTutorial>;
}

function AccountTutorial({ user, ready, children }: { user: User; ready: boolean; children: ReactNode }) {
  const router = useRouter();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [completedChapter, setCompletedChapter] = useState("");
  const [skippedInChapter, setSkippedInChapter] = useState(false);
  const [everyVisit, setEveryVisit] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<{ chapter: string; index: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const manuallyOpened = useRef(false);
  const userRef = useRef(user);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadTutorialPreferences(userRef.current).then(prefs => {
      if (cancelled) return;
      setEveryVisit(prefs.everyVisit);
      if (!manuallyOpened.current && (prefs.everyVisit || prefs.seenVersion < TUTORIAL_VERSION)) setCatalogOpen(true);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setLoaded(true); // Read failure must not be mistaken for a first visit.
    });
    return () => { cancelled = true; };
  }, []);
  async function remember() {
    try { await saveTutorialPreferences(userRef.current, { seenVersion: TUTORIAL_VERSION }); }
    catch { if (alive.current) setNotice("教程状态暂未保存，下次进入时可能再次显示。"); }
  }
  function close() { setActive(null); setCatalogOpen(false); void remember(); }
  function start(chapter: string, index = 0) {
    const selected = tutorialChapters.find(item => item.id === chapter)!;
    setCatalogOpen(false);
    setSkippedInChapter(false);
    setActive({ chapter, index });
    router.push(selected.steps[index].route);
  }
  const chapter = tutorialChapters.find(item => item.id === active?.chapter);
  function advance(skipped = false) {
    if (!active || !chapter) return;
    if (skipped) setSkippedInChapter(true);
    if (active.index < chapter.steps.length - 1) {
      const next = active.index + 1;
      setActive({ ...active, index: next });
      if (chapter.steps[next].route !== chapter.steps[active.index].route) router.push(chapter.steps[next].route);
    } else {
      setActive(null);
      setCompletedChapter(chapter.title);
      void remember();
      // Leave any real form open so finishing a lesson never discards user input.
      if (!document.querySelector('[role="dialog"][aria-modal="true"]')) setCatalogOpen(true);
      else setNotice("这一段已结束。可从“查看教程”继续学习其他功能。");
    }
  }
  return <TutorialContext.Provider value={() => {
    manuallyOpened.current = true; setActive(null); setCompletedChapter(""); setCatalogOpen(true);
  }}>
    {children}
    <Dialog open={catalogOpen && ready && loaded} title={completedChapter ? skippedInChapter ? "这一段已结束" : "这一段已完成" : "跟着做一遍"} onClose={close}>
      <div data-tutorial-catalog>
        <p className="mb-4 text-sm leading-6 text-muted">{completedChapter ? skippedInChapter ? `已结束“${completedChapter}”，跳过的步骤可以随时重走。还想了解哪个功能？` : `已走完“${completedChapter}”。还想了解哪个功能？` : "从一餐开始，也可以选择你现在想用的功能。每一步都在实际页面中完成。"}</p>
        <div className="tutorial-chapters">
          {tutorialChapters.map((item, index) => <button key={item.id} type="button" onClick={() => start(item.id)}>
            <span className="tutorial-chapter-index">{index + 1}</span>
            <span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={18} />
          </button>)}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">请使用自己的真实数据，修改按页面提示保存。可以随时结束，之后从“查看教程”重新开始。</p>
        <label className="check-label mt-4">
          <input type="checkbox" checked={everyVisit} disabled={savingPreference} onChange={async event => {
            const next = event.target.checked;
            setSavingPreference(true);
            try {
              await saveTutorialPreferences(userRef.current, { everyVisit: next });
              if (alive.current) setEveryVisit(next);
            } catch { if (alive.current) setNotice("显示设置未保存，请稍后再试。"); }
            finally { if (alive.current) setSavingPreference(false); }
          }} />每次进入时显示教程
        </label>
        <button className="btn-secondary mt-5 w-full" type="button" onClick={close}>{completedChapter ? "开始自己使用" : "暂时跳过"}</button>
      </div>
    </Dialog>
    {active && chapter && <TutorialGuide key={`${active.chapter}:${active.index}`} step={chapter.steps[active.index]} index={active.index} count={chapter.steps.length} onNext={advance} onClose={close} onLocate={() => router.push(chapter.steps[active.index].route)} />}
    {notice && <div className="tutorial-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="关闭教程提示" onClick={() => setNotice("")}><X size={16} /></button></div>}
  </TutorialContext.Provider>;
}

function TutorialGuide({ step, index, count, onNext, onClose, onLocate }: { step: TutorialStep; index: number; count: number; onNext: (skipped?: boolean) => void; onClose: () => void; onLocate: () => void }) {
  const [done, setDone] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const [modal, setModal] = useState<HTMLElement | null>(null);
  const [waitingTooLong, setWaitingTooLong] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const requiresAction = Boolean(step.action || step.interaction);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tutorialRunning = "true";
    let frame = 0;
    let scrollTarget: HTMLElement | null = null;
    function locate() {
      const nextModal = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].find(element => !element.querySelector("[data-tutorial-catalog]") && element.getClientRects().length) ?? null;
      if (modalRef.current !== nextModal) { modalRef.current = nextModal; setModal(nextModal); }
      const element = nextModal?.querySelector<HTMLElement>(".dialog-panel") ?? nextModal ?? document.querySelector<HTMLElement>(step.selector);
      const visible = element && element.getClientRects().length ? element : null;
      if (target.current !== visible) {
        target.current?.removeAttribute("data-tour-highlight");
        target.current = visible;
        visible?.setAttribute("data-tour-highlight", "true");
        setTargetFound(Boolean(visible));
      }
      if (visible && visible !== scrollTarget) {
        scrollTarget = visible;
        if (!nextModal) visible.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(locate); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour", "hidden", "aria-expanded"] });
    window.addEventListener("resize", schedule);
    schedule();
    const timer = window.setTimeout(() => setWaitingTooLong(true), 8000);
    return () => {
      clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule);
      target.current?.removeAttribute("data-tour-highlight");
      delete root.dataset.tutorialRunning;
      root.style.removeProperty("--tutorial-height");
    };
  }, [step]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (!modal) element.focus({ preventScroll: true });
    const update = () => document.documentElement.style.setProperty("--tutorial-height", `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, [modal]);
  useEffect(() => {
    function action(event: Event) { if ((event as CustomEvent).detail === step.action) setDone(true); }
    function interaction(event: Event) {
      if (!step.interaction || !(event.target instanceof Element)) return;
      if (event.target.closest(step.interaction.selector)) {
        if (event.type === "input" && event.target instanceof HTMLInputElement && !event.target.value.trim()) return;
        setDone(true);
      }
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]')) { event.preventDefault(); onClose(); }
    }
    window.addEventListener(TUTORIAL_EVENT, action);
    if (step.interaction) document.addEventListener(step.interaction.event, interaction);
    document.addEventListener("keydown", keydown);
    return () => { window.removeEventListener(TUTORIAL_EVENT, action); if (step.interaction) document.removeEventListener(step.interaction.event, interaction); document.removeEventListener("keydown", keydown); };
  }, [step, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(<div ref={panel} className="tutorial-card" role="region" aria-label="操作引导" tabIndex={-1} onClick={event => event.stopPropagation()}>
    <header className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-accent2">操作引导 · {index + 1} / {count}</span><button type="button" className="icon-button" aria-label="结束教程" onClick={onClose}><X size={18} /></button></header>
    <h2 className="mb-2 text-lg" id="tutorial-step-title">{step.title}</h2>
    <p className="text-sm leading-6 text-muted">{step.description}</p>
    <p className="tutorial-feedback" role="status">{done ? <><Check size={15} />已完成这一步，可以继续</> : !targetFound ? waitingTooLong ? "页面尚未准备好，可以重新定位或跳过。" : "正在定位操作位置…" : requiresAction ? "请先在页面上完成这一步" : "可以在页面上试一试，再继续"}</p>
    <footer className="flex items-center justify-between gap-3">
      <button type="button" className="btn-text text-xs" onClick={() => onNext(true)}>跳过这一步</button>
      {targetFound && !done && <button type="button" className="btn-text text-xs" onClick={() => {
        const element = target.current;
        element?.scrollIntoView({ block: "center", behavior: "instant" });
        const control = element?.matches("button,input,select,a") ? element : element?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),a");
        control?.focus({ preventScroll: true });
      }}>前往操作</button>}
      {!targetFound && <button type="button" className="btn-secondary text-xs" onClick={onLocate}>重新定位</button>}
      <button type="button" className="btn-primary" disabled={requiresAction && !done} onClick={() => onNext()}>{index === count - 1 ? "完成这一段" : "继续"}<ChevronRight size={15} /></button>
    </footer>
  </div>, modal ?? document.body);
}
