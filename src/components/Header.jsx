import { useEffect, useState } from 'react';

export default function Header({ site, isPhone, onNavigate }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isPhone && isMenuOpen) {
      setIsMenuOpen(false);
    }
  }, [isPhone, isMenuOpen]);

  const navLinksClass = isMenuOpen ? 'nav-links is-open' : 'nav-links';

  function handleSectionLink(event, sectionId) {
    event.preventDefault();
    setIsMenuOpen(false);
    window.setTimeout(() => onNavigate(sectionId), 0);
  }

  return (
    <header className="site-header">
      <nav className="container nav" aria-label="Main navigation">
        <div className="nav-top">
          <a className="brand" href="#home" onClick={(event) => handleSectionLink(event, 'home')}>
            {site.name}
          </a>
          {isPhone ? (
            <button
              className="nav-toggle"
              type="button"
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setIsMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>
          ) : null}
        </div>

        <div className={navLinksClass}>
          <a href="#menu" onClick={(event) => handleSectionLink(event, 'menu')}>
            Menu
          </a>
          <a href="#contact" onClick={(event) => handleSectionLink(event, 'contact')}>
            Contact
          </a>
          <a href={site.uberEatsUrl} target="_blank" rel="noreferrer" onClick={() => setIsMenuOpen(false)}>
            Order
          </a>
        </div>
      </nav>
    </header>
  );
}
