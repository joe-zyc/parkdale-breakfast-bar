import { useState } from 'react';
import site from './data/site.json';
import menu from './data/menu.json';
import Header from './components/Header.jsx';
import MenuNav from './components/MenuNav.jsx';
import MenuSection from './components/MenuSection.jsx';
import ContactInfo from './components/ContactInfo.jsx';
import useViewportType from './hooks/useViewportType.js';

export default function App() {
  const { viewportType, isPhone } = useViewportType();
  const [activeSectionId, setActiveSectionId] = useState(menu.sections[0]?.id ?? '');
  const activeSection = menu.sections.find((section) => section.id === activeSectionId) ?? menu.sections[0];

  return (
    <div className={`app-shell view-${viewportType}`}>
      <Header site={site} isPhone={isPhone} />

      <main>
        <section className="hero" id="home">
          <div className="container hero-content">
            <p className="eyebrow">Restaurant & Bar</p>
            <h1>{site.name}</h1>
            <p className="tagline">{site.tagline}</p>
            <p className="description">{site.description}</p>
            <div className="actions">
              <a className="button primary" href="#menu">
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

            <MenuNav sections={menu.sections} activeSectionId={activeSection?.id} onSelectSection={setActiveSectionId} />

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
