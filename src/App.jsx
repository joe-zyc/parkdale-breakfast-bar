import { useCallback, useEffect, useRef, useState } from 'react';
import site from './data/site.json';
import menu from './data/menu.json';
import Header from './components/Header.jsx';
import MenuNav from './components/MenuNav.jsx';
import MenuSection from './components/MenuSection.jsx';
import ContactInfo from './components/ContactInfo.jsx';
import useViewportType from './hooks/useViewportType.js';

const MAIN_SECTION_IDS = new Set(['home', 'menu', 'contact']);
const MENU_SECTION_IDS = new Set(menu.sections.map((section) => section.id));

function getHashId() {
  const hash = window.location.hash.replace(/^#/, '');

  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

export default function App() {
  const { viewportType, isPhone } = useViewportType();
  const [activeSectionId, setActiveSectionId] = useState(menu.sections[0]?.id ?? '');
  const scrollFrameRef = useRef(null);
  const activeSection = menu.sections.find((section) => section.id === activeSectionId) ?? menu.sections[0];

  const scrollToSection = useCallback((sectionId, behavior = 'smooth') => {
    const target = document.getElementById(sectionId);
    const header = document.querySelector('.site-header');

    if (!target) {
      return;
    }

    const headerHeight = header?.offsetHeight ?? 0;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight;

    window.scrollTo({
      top: targetTop,
      behavior,
    });
  }, []);

  const scheduleScroll = useCallback(
    (sectionId, behavior) => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollToSection(sectionId, behavior);
          scrollFrameRef.current = null;
        });
      });
    },
    [scrollToSection],
  );

  const applyHash = useCallback(
    (hashId, behavior) => {
      if (MENU_SECTION_IDS.has(hashId)) {
        setActiveSectionId(hashId);
        scheduleScroll('menu', behavior);
        return true;
      }

      if (MAIN_SECTION_IDS.has(hashId)) {
        scheduleScroll(hashId, behavior);
        return true;
      }

      return false;
    },
    [scheduleScroll],
  );

  const navigateToHash = useCallback(
    (hashId) => {
      if (!MAIN_SECTION_IDS.has(hashId) && !MENU_SECTION_IDS.has(hashId)) {
        return;
      }

      const nextHash = `#${hashId}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
      applyHash(hashId, 'smooth');
    },
    [applyHash],
  );

  useEffect(() => {
    function handleHistoryNavigation() {
      applyHash(getHashId(), 'auto');
    }

    handleHistoryNavigation();
    window.addEventListener('hashchange', handleHistoryNavigation);
    window.addEventListener('popstate', handleHistoryNavigation);

    return () => {
      window.removeEventListener('hashchange', handleHistoryNavigation);
      window.removeEventListener('popstate', handleHistoryNavigation);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [applyHash]);

  function handleMenuClick(event) {
    event.preventDefault();
    navigateToHash('menu');
  }

  return (
    <div className={`app-shell view-${viewportType}`}>
      <Header site={site} isPhone={isPhone} onNavigate={navigateToHash} />

      <main>
        <section className="hero" id="home">
          <div className="container hero-content">
            <a className="eyebrow location-link" href={site.mapUrl} target="_blank" rel="noreferrer">
              {site.address}
            </a>
            <h1>{site.name}</h1>
            <p className="description">{site.description}</p>
            <div className="actions">
              <a className="button primary" href="#menu" onClick={handleMenuClick}>
                View Menu
              </a>
              <a className="button" href={site.uberEatsUrl} target="_blank" rel="noreferrer">
                Order on Uber Eats
              </a>
            </div>
          </div>
        </section>

        <section className="section" id="menu">
          <div className="container">
            <div className="section-heading">
              <p className="menu-eyebrow">Menu</p>
            </div>

            <MenuNav sections={menu.sections} activeSectionId={activeSection?.id} onSelectSection={navigateToHash} />

            <div className="menu-layout">
              {activeSection ? <MenuSection key={activeSection.id} section={activeSection} isPhone={isPhone} /> : null}
            </div>
          </div>
        </section>

        <section className="section contact-section" id="contact">
          <div className="container">
            <ContactInfo site={site} />
          </div>
        </section>
      </main>
    </div>
  );
}
