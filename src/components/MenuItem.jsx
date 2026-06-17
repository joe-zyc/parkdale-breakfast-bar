function getImageSrc(image) {
  if (!image) {
    return '';
  }

  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) {
    return image;
  }

  return `${import.meta.env.BASE_URL}${image.replace(/^\/+/, '')}`;
}

export default function MenuItem({ item }) {
  const imageSrc = getImageSrc(item.image);

  return (
    <article className={item.image ? 'menu-item with-image' : 'menu-item'}>
      {item.image ? (
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
      </div>
    </article>
  );
}
