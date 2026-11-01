import { useEffect, useState } from 'react';
import { BookMarked, BookOpen, Files, LayoutGrid } from 'lucide-react';
import { AccessGate } from './components/AccessGate';
import { BrandMark } from './components/BrandMark';
import { gateEnabled, isUnlocked } from './lib/accessGate';
import { CourseBuilder } from './pages/CourseBuilder';
import { FilesView } from './pages/FilesView';
import { PdfStudioPage } from './pages/PdfStudioPage';
import { ThemeLibraryPage } from './pages/ThemeLibraryPage';

type View = 'workbench' | 'files' | 'courses' | 'themes';

const views: Array<{ id: View; label: string; icon: typeof LayoutGrid }> = [
  { id: 'workbench', label: '工作台', icon: LayoutGrid },
  { id: 'files', label: '文件', icon: Files },
  { id: 'courses', label: '组课', icon: BookOpen },
  { id: 'themes', label: '主题库', icon: BookMarked }
];

export default function App() {
  const [view, setView] = useState<View>('workbench');
  const [granted, setGranted] = useState(!gateEnabled || isUnlocked());

  useEffect(() => {
    setGranted(!gateEnabled || isUnlocked());
  }, []);

  if (!granted) {
    return <AccessGate />;
  }

  return (
    <div className="app-frame">
      <div className="app-column">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <BrandMark size={29} />
            </span>
            <span className="brand-copy">
              <strong>AtomPDF</strong>
              <small>原子课件 · 分类树</small>
            </span>
          </div>
          <nav className="app-switch" role="tablist" aria-label="视图切换">
            {views.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'is-active' : ''}
                onClick={() => setView(item.id)}
                role="tab"
                aria-selected={view === item.id}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </nav>
          <span className="topbar-note">本地运行 · 资料与分类只存在这台机器</span>
        </header>
        <main className="app-main">
          {view === 'workbench' && (
            <PdfStudioPage
              onThemeCreated={() => setView('themes')}
              onOpenLibrary={() => setView('themes')}
            />
          )}
          {view === 'files' && <FilesView />}
          {view === 'courses' && <CourseBuilder />}
          {view === 'themes' && <ThemeLibraryPage />}
        </main>
      </div>
    </div>
  );
}
