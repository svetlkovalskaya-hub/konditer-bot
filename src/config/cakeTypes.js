// Виды тортов, которые показываются при выборе продукта «Торт».
// Названия идут в алфавитном порядке.
//
// Когда будут готовы фото, положите файлы в папку uploads/cake-photos/
// и пропишите путь в поле photoFile. Пример:
// { name: 'Наполеон', photoFile: 'uploads/cake-photos/napoleon.jpg' }
const CAKE_TYPES = [
  { name: 'Ваниль-клубника', photoFile: 'uploads/cake-photos/ваниль-клубника.jpg' },
  { name: 'Вишня-шоколад', photoFile: 'uploads/cake-photos/вишня-шоколад.jpg' },
  { name: 'Карамельная девочка', photoFile: 'uploads/cake-photos/карамельная-девочка.jpg' },
  { name: 'Медовик', photoFile: 'uploads/cake-photos/медовик.jpg', flavors: ['Классический', 'Шоколадный'] },
  { name: 'Меллер', photoFile: 'uploads/cake-photos/меллер.jpg' },
  { name: 'Молочная девочка', photoFile: 'uploads/cake-photos/молочная-девочка.jpg' },
  { name: 'Молочный ломтик', photoFile: 'uploads/cake-photos/молочный-ломтик.jpg' },
  { name: 'Наполеон', photoFile: 'uploads/cake-photos/наполеон.jpg', flavors: ['Классический', 'Шоколадный'] },
  { name: 'Сникерс', photoFile: 'uploads/cake-photos/сникерс.jpg' },
  { name: 'Шоколадный бисквит с вишневым компоте', photoFile: 'uploads/cake-photos/шоколадный-с-вишневым-компоте.jpg' },
  { name: 'Шоколадный с малиновым конфи и сливочно-малиновым муссом', photoFile: 'uploads/cake-photos/шоколадный-с-малиновым-конфи.jpg' },
];

module.exports = CAKE_TYPES;
