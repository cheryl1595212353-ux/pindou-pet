import { useEffect, useState, type ReactNode } from "react";
import {
  createBrowserRouter,
  createMemoryRouter,
  Link,
  Outlet,
  type RouteObject,
} from "react-router-dom";

import { PixelDogStudio } from "./pixel-dog/PixelDogStudio";

const DESKTOP_EDITOR_MIN_WIDTH = 1280;

function ProductFrame() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="返回创建页">
          <span className="brand-mark" aria-hidden="true">
            ●
          </span>
          拼豆宠物
        </Link>
        <span className="phase-label">2D 互动版 · LOCAL</span>
      </header>
      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
}

function PlaceholderPage({ eyebrow, title, description }: PageCopy) {
  return (
    <section className="placeholder-card">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="description">{description}</p>
      <div className="bead-strip" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </section>
  );
}

function HomePage() {
  return <PixelDogStudio />;
}

function useDesktopEditorAllowed(): boolean {
  const [isAllowed, setIsAllowed] = useState(
    () => window.innerWidth >= DESKTOP_EDITOR_MIN_WIDTH,
  );

  useEffect(() => {
    const update = () => setIsAllowed(window.innerWidth >= DESKTOP_EDITOR_MIN_WIDTH);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isAllowed;
}

function EditPage() {
  const isAllowed = useDesktopEditorAllowed();

  if (!isAllowed) {
    return (
      <section className="viewport-notice" role="status">
        <span className="viewport-icon" aria-hidden="true">
          ↔
        </span>
        <h1>需要更宽的画布</h1>
        <p>请在宽度至少 1280px 的桌面浏览器中编辑</p>
      </section>
    );
  }

  return (
    <PlaceholderPage
      eyebrow="桌面工作区"
      title="图层与拼豆编辑"
      description="编辑器将在 Provider 可行性门通过后实施"
    />
  );
}

interface PageCopy {
  eyebrow: string;
  title: ReactNode;
  description: string;
}

const routes: RouteObject[] = [
  {
    element: <ProductFrame />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/projects/:projectId/edit", element: <EditPage /> },
      {
        path: "/projects/:projectId/room",
        element: (
          <PlaceholderPage
            eyebrow="角色空间"
            title="互动房间"
            description="互动能力将在角色资产合同稳定后接入"
          />
        ),
      },
      {
        path: "/projects/:projectId/export",
        element: (
          <PlaceholderPage
            eyebrow="交付空间"
            title="导出预览"
            description="这里将承载拼豆图纸与角色图片导出"
          />
        ),
      },
    ],
  },
];

export function createAppRouter(initialPath?: string) {
  if (initialPath !== undefined) {
    return createMemoryRouter(routes, { initialEntries: [initialPath] });
  }
  return createBrowserRouter(routes);
}
