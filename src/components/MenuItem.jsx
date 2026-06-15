import { useEffect, useState } from 'react';

function getImageSrc(image) {
  if (!image) {
    return '';
  }

  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) {
    return image;
  }

  return `${import.meta.env.BASE_URL}${image.replace(/^\/+/, '')}`;
}

export default function MenuItem({ item, isPhone }) {
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const shouldUsePhoneImageToggle = Boolean(item.image && isPhone);
  const imageSrc = getImageSrc(item.image);

  useEffect(() => {
    if (!isPhone && isPhotoExpanded) {
      setIsPhotoExpanded(false);
    }
  }, [isPhone, isPhotoExpanded]);

  function togglePhoto() {
    if (shouldUsePhoneImageToggle) {
      setIsPhotoExpanded((current) => !current);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePhoto();
    }
  }

  return (
    <article
      className={item.image ? 'menu-item with-image' : 'menu-item'}
      role={shouldUsePhoneImageToggle ? 'button' : undefined}
      tabIndex={shouldUsePhoneImageToggle ? 0 : undefined}
      aria-expanded={shouldUsePhoneImageToggle ? isPhotoExpanded : undefined}
      onClick={togglePhoto}
      onKeyDown={shouldUsePhoneImageToggle ? handleKeyDown : undefined}
    >
      {item.image && !shouldUsePhoneImageToggle ? (
        <div className="menu-item-image-frame">
          <img className="menu-item-image" src={imageSrc} alt={item.name} loading="lazy" />
        </div>
      ) : null}

      <div className="menu-item-content">
        <div className="menu-item-header">
          <h4>{item.name}</h4>
          <div className="menu-item-meta">
            <span>{item.price}</span>
          </div>
        </div>
        {item.description ? <p>{item.description}</p> : null}

        {shouldUsePhoneImageToggle ? (
          <div className={isPhotoExpanded ? 'photo-dropdown is-open' : 'photo-dropdown'}>
            <div className="photo-dropdown-frame">
              <img src={imageSrc} alt={item.name} loading="lazy" />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
