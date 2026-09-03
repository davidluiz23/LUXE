begin;

-- Replace only the seed URLs known to be unreliable. Custom administrator
-- media is preserved because every update matches the exact legacy value.
update public.products as product
set image = replacement.new_image
from (
  values
    (53::bigint,
      'https://static.austenblake.com/clpd00004/pa0000853/detail/3d/yy/di/0001.jpg',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&auto=format&fit=crop'),
    (56::bigint,
      'https://static.austenblake.com/cler00010/ea0000103/detail/3d/ww/di/0001.jpg',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop'),
    (58::bigint,
      'https://cdn-images.farfetch-contents.com/20/98/00/52/20980052_51122629_1000.jpg',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop'),
    (75::bigint,
      'https://www.footasylum.com/images/products/large/4112897.jpg',
      'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=600&auto=format&fit=crop'),
    (76::bigint,
      'https://cdn-images.farfetch-contents.com/22/10/30/11/22103011_51862196_1000.jpg',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop'),
    (77::bigint,
      'https://cdn-images.farfetch-contents.com/36/41/76/97/36417697_68455637_1000.jpg',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop'),
    (78::bigint,
      'https://cdn-images.farfetch-contents.com/23/70/60/47/23706047_53613814_1000.jpg',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&auto=format&fit=crop'),
    (88::bigint,
      'https://editorialist.com/thumbnail/600/2024/2/028/685/474/28685474~red_0.webp?width=600&quality=60',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop')
) as replacement(id, old_image, new_image)
where product.id = replacement.id
  and product.image = replacement.old_image;

update public.products as product
set hover_image = replacement.new_hover_image
from (
  values
    (51::bigint,
      'https://images.unsplash.com/photo-1609357530491-030999908cfd?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&auto=format&fit=crop'),
    (53::bigint,
      'https://static.austenblake.com/clpd00004/pa0000853/detail/model/yy/di/0001.jpg',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop'),
    (54::bigint,
      'https://images.unsplash.com/photo-1551163944-7f1a9ee00f1a?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop'),
    (56::bigint,
      'https://static.austenblake.com/cler00010/ea0000103/detail/down/ww/di/0001.jpg',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&auto=format&fit=crop'),
    (58::bigint,
      'https://i.pinimg.com/1200x/3d/1e/9e/3d1e9ea22065967826a63efb8716abc4.jpg',
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&auto=format&fit=crop'),
    (75::bigint,
      'https://www.footasylum.com/images/products/large/4112897_1.jpg',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop'),
    (76::bigint,
      'https://cdn-images.farfetch-contents.com/22/10/30/11/22103011_49059242_1000.jpg',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&auto=format&fit=crop'),
    (77::bigint,
      'https://cdn-images.farfetch-contents.com/36/41/76/97/36417697_68455503_1000.jpg',
      'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=600&auto=format&fit=crop'),
    (78::bigint,
      'https://cdn-images.farfetch-contents.com/23/70/60/47/23706047_53613814_1000.jpg',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop'),
    (88::bigint,
      'https://editorialist.com/thumbnails/600/2024/2/028/685/474/28685474~red_1.webp',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&auto=format&fit=crop')
) as replacement(id, old_hover_image, new_hover_image)
where product.id = replacement.id
  and product.hover_image = replacement.old_hover_image;

commit;
