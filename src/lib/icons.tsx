import {
  Beef, Beer, Cake, CakeSlice, Candy, Citrus, Coffee, Cookie, Croissant, CupSoda, Drumstick, Egg, Fish, Flame,
  GlassWater, IceCreamCone, Martini, Milk, Pizza, Plus, Popcorn, Salad, Sandwich, Soup, Utensils, Wine,
  type LucideIcon,
} from 'lucide-react'

// Ícones disponíveis no cadastro de categorias
export const categoryIcons: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'sandwich', label: 'Lanche', Icon: Sandwich },
  { key: 'beef', label: 'Carne', Icon: Beef },
  { key: 'drumstick', label: 'Porção / frango', Icon: Drumstick },
  { key: 'pizza', label: 'Pizza', Icon: Pizza },
  { key: 'salad', label: 'Salada', Icon: Salad },
  { key: 'soup', label: 'Sopa', Icon: Soup },
  { key: 'fish', label: 'Peixe', Icon: Fish },
  { key: 'egg', label: 'Ovo', Icon: Egg },
  { key: 'croissant', label: 'Padaria', Icon: Croissant },
  { key: 'popcorn', label: 'Petisco', Icon: Popcorn },
  { key: 'flame', label: 'Grelhados', Icon: Flame },
  { key: 'cup-soda', label: 'Refrigerante', Icon: CupSoda },
  { key: 'beer', label: 'Cerveja', Icon: Beer },
  { key: 'wine', label: 'Vinho', Icon: Wine },
  { key: 'martini', label: 'Drinks', Icon: Martini },
  { key: 'glass-water', label: 'Água', Icon: GlassWater },
  { key: 'coffee', label: 'Café', Icon: Coffee },
  { key: 'milk', label: 'Leite', Icon: Milk },
  { key: 'citrus', label: 'Sucos', Icon: Citrus },
  { key: 'ice-cream', label: 'Sorvete', Icon: IceCreamCone },
  { key: 'cake', label: 'Bolo', Icon: Cake },
  { key: 'cake-slice', label: 'Sobremesa', Icon: CakeSlice },
  { key: 'cookie', label: 'Biscoito', Icon: Cookie },
  { key: 'candy', label: 'Doces', Icon: Candy },
  { key: 'plus', label: 'Acréscimo', Icon: Plus },
  { key: 'utensils', label: 'Outros', Icon: Utensils },
]

export const iconFor = (key: string): LucideIcon => categoryIcons.find((i) => i.key === key)?.Icon ?? Utensils
