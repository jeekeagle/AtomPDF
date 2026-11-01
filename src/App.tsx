import { useState } from 'react';
import { BookMarked, LayoutGrid } from 'lucide-react';
import { PdfStudioPage } from './pages/PdfStudioPage';
import { ThemeLibraryPage } from './pages/ThemeLibraryPage';

export default function App() {
  const [view, setView] = useState<'workbench' | 'themes'>('workbench');

  return (
    <div className="app-frame">
      <div className="app-column">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>PDF 知识树</strong>
              <small>KNOWLEDGE ATLAS</small>
            </span>
          </div>
          <nav className="app-switch" role="tablist" aria-label="视图切换">
            <button
              className={view === 'workbench' ? 'is-active' : ''}
              onClick={() => setView('workbench')}
              role="tab"
              aria-selected={view === 'workbench'}
            >
              <LayoutGrid size={14} />
              工作台
            </button>
            <button
              className={view === 'themes' ? 'is-active' : ''}
              onClick={() => setView('themes')}
              role="tab"
              aria-selected={view === 'themes'}
            >
              <BookMarked size={14} />
              主题库
            </button>
          </nav>
          <span className="topbar-note">本地运行 · 资料与书架只存在这台机器</span>
        </header>
        <main className="app-main">
          {view === 'workbench' ? (
            <PdfStudioPage
              onThemeCreated={() => setView('themes')}
              onOpenLibrary={() => setView('themes')}
            />
          ) : (
            <ThemeLibraryPage />
          )}
        </main>
      </div>
    </div>
  );
}
