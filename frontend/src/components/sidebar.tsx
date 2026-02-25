'use client';

import {
  BarChart3,
  Brain,
  MessageSquare,
  MessageSquareText,
  PlayCircle,
  Target,
  BookOpen,
  Activity,
  Users,
  ChevronLeft,
  ChevronRight,
  Home,
  Settings,
  Bot,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { getFeaturesConfig } from '@/lib/api';
import { usePluginNav } from '@/lib/hooks/usePluginNav';
import { useAppIconUrl, useBranding } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { CopilotSidebar } from './copilot';

import type { LucideIcon } from 'lucide-react';

// Icon map for plugin nav items — maps Lucide icon names to components
const iconMap: Record<string, LucideIcon> = { Brain, PlayCircle };
const resolveIcon = (name: string): LucideIcon => {
  const icon = iconMap[name];
  if (!icon && process.env.NODE_ENV === 'development') {
    console.warn(`[plugins] Unknown icon "${name}", using fallback`);
  }
  return icon ?? LayoutGrid;
};

const coreMainNav = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Production', href: '/production', icon: LayoutDashboard },
  { name: 'Evaluate', href: '/evaluate/upload', icon: BarChart3 },
  { name: 'Monitor', href: '/monitoring', icon: Activity },
  { name: 'Human Signals', href: '/human-signals', icon: MessageSquareText },
];

const toolsNav = [
  { name: 'Annotation Studio', href: '/annotation-studio', icon: MessageSquare },
  { name: 'CaliberHQ', href: '/caliber-hq', icon: Target },
  { name: 'Simulate', href: '/simulation', icon: Users },
  { name: 'Synthetic', href: '/synthetic', icon: Sparkles },
  { name: 'Learn', href: '/learn', icon: BookOpen },
];

function NavItem({
  item,
  isActive,
  collapsed,
}: {
  item: { name: string; href: string; icon: typeof Home };
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-primary text-white shadow-[0_2px_8px_rgba(139,159,79,0.3)]'
            : 'text-text-muted hover:bg-gray-100 hover:text-text-primary',
          collapsed && 'justify-center px-2'
        )}
        title={collapsed ? item.name : undefined}
      >
        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotEnabled, setCopilotEnabled] = useState(true);
  const appIconUrl = useAppIconUrl();
  const branding = useBranding();
  const { data: pluginData } = usePluginNav();

  useEffect(() => {
    getFeaturesConfig()
      .then((config) => setCopilotEnabled(config.copilot_enabled))
      .catch(() => {
        // Default to enabled if config fetch fails
      });
  }, []);

  const enabledPluginNav = useMemo(
    () => (pluginData?.plugins ?? []).filter((p) => p.enabled).flatMap((p) => p.nav),
    [pluginData]
  );

  const mainNav = useMemo(() => {
    const pluginMainNav = enabledPluginNav
      .filter((n) => n.section === 'main')
      .map((n) => ({ name: n.name, href: n.href, icon: resolveIcon(n.icon) }));
    return [...coreMainNav, ...pluginMainNav];
  }, [enabledPluginNav]);

  const mergedToolsNav = useMemo(() => {
    const pluginToolsNav = enabledPluginNav
      .filter((n) => n.section === 'tools')
      .map((n) => ({ name: n.name, href: n.href, icon: resolveIcon(n.icon) }));
    return [...toolsNav, ...pluginToolsNav];
  }, [enabledPluginNav]);

  const iconSrc = appIconUrl || '/images/ax-icon.png';

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      <aside
        className={cn(
          'flex h-screen flex-col border-r border-border bg-white transition-all duration-300',
          collapsed ? 'w-20' : 'w-60'
        )}
      >
        {/* Brand */}
        <div className="px-3.5 pb-0 pt-5">
          {!collapsed ? (
            <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-6">
              <div className="h-8 w-8 overflow-hidden rounded-lg">
                <Image
                  src={iconSrc}
                  alt={branding.app_name}
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                  unoptimized={!!appIconUrl}
                />
              </div>
              <span className="bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-xl font-bold text-transparent">
                {branding.app_name}
              </span>
            </Link>
          ) : (
            <div className="flex items-center justify-center pb-6">
              <Link href="/" className="block h-8 w-8 overflow-hidden rounded-lg">
                <Image
                  src={iconSrc}
                  alt={branding.app_name}
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                  unoptimized={!!appIconUrl}
                />
              </Link>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3.5">
          {/* Main section */}
          {!collapsed && (
            <div className="px-3 pb-2 pt-0 text-[10px] font-semibold uppercase tracking-[1.2px] text-text-muted">
              Main
            </div>
          )}
          <ul className="space-y-0.5">
            {mainNav.map((item) => (
              <NavItem
                key={item.name}
                item={item}
                isActive={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </ul>

          {/* Tools section */}
          {!collapsed && (
            <div className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[1.2px] text-text-muted">
              Tools
            </div>
          )}
          {collapsed && <div className="my-3 border-t border-border" />}
          <ul className="space-y-0.5">
            {mergedToolsNav.map((item) => (
              <NavItem
                key={item.name}
                item={item}
                isActive={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </ul>
        </nav>

        {/* Bottom Actions */}
        <div className="mt-auto space-y-1 border-t border-gray-100 px-3.5 py-3">
          {/* AI Copilot Button */}
          {copilotEnabled ? (
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-[10px] text-[13px] font-medium transition-all duration-150',
                copilotOpen
                  ? 'border border-accent-gold/25 bg-accent-gold/10 text-accent-gold'
                  : 'border border-accent-gold/15 bg-accent-gold/[0.06] text-accent-gold hover:border-accent-gold/25 hover:bg-accent-gold/10',
                collapsed && 'justify-center border-0 bg-transparent px-2'
              )}
              title={collapsed ? 'AI Copilot' : undefined}
            >
              <Bot className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span>AI Copilot</span>}
            </button>
          ) : (
            <div
              className={cn(
                'group relative flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-[10px] text-[13px] font-medium opacity-50',
                collapsed && 'justify-center px-2'
              )}
            >
              <Lock className="h-[18px] w-[18px] flex-shrink-0 text-text-muted" />
              {!collapsed && <span className="text-text-muted">AI Copilot</span>}
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Disabled by Admin
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
              </div>
            </div>
          )}

          {/* Settings */}
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-medium text-text-muted transition-colors duration-150 hover:bg-gray-100 hover:text-text-primary',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-medium text-text-muted transition-colors duration-150 hover:bg-gray-100 hover:text-text-primary',
              collapsed && 'justify-center px-2'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-[18px] w-[18px] flex-shrink-0" />
            ) : (
              <>
                <ChevronLeft className="h-[18px] w-[18px] flex-shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* AI Copilot Sidebar */}
      {copilotEnabled && (
        <CopilotSidebar isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />
      )}
    </>
  );
}
