import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { CategoryCardType } from '../../types';
import { formatAmount, parseAmount } from './categories';

export const transferFunds = async (
  sourceCategory: CategoryCardType,
  targetCategory: CategoryCardType,
  amount: number,
  description: string
): Promise<void> => {
  if (!amount || amount <= 0) {
    throw new Error('Сумма перевода должна быть больше нуля');
  }

  if (!description.trim()) {
    throw new Error('Необходимо указать комментарий к переводу');
  }

  try {
    await runTransaction(db, async (transaction) => {
      // Получаем документы категорий
      const sourceRef = doc(db, 'categories', sourceCategory.id);
      const targetRef = doc(db, 'categories', targetCategory.id);
      
      const sourceDoc = await transaction.get(sourceRef);
      const targetDoc = await transaction.get(targetRef);

      if (!sourceDoc.exists()) {
        throw new Error('Категория отправителя не найдена');
      }

      if (!targetDoc.exists()) {
        throw new Error('Категория получателя не найдена');
      }

      // Получаем текущие балансы
      const sourceBalance = parseAmount(sourceDoc.data().amount);
      const targetBalance = parseAmount(targetDoc.data().amount);

      // Создаем транзакцию списания для источника (клиента)
      const withdrawalRef = doc(collection(db, 'transactions'));
      transaction.set(withdrawalRef, {
        categoryId: sourceCategory.id,
        fromUser: sourceCategory.title,
        toUser: targetCategory.title,
        amount: -amount, // Отрицательная сумма для списания
        description,
        type: 'expense',
        date: serverTimestamp()
      });

      // Создаем транзакцию пополнения для получателя
      const depositRef = doc(collection(db, 'transactions'));
      transaction.set(depositRef, {
        categoryId: targetCategory.id,
        fromUser: sourceCategory.title,
        toUser: targetCategory.title,
        amount: amount, // Положительная сумма для пополнения
        description,
        type: 'income',
        date: serverTimestamp()
      });

      // Создаем системную транзакцию (всегда положительная для клиентских транзакций)
      if (sourceCategory.row === 1) { // Если источник - клиент (row 1)
        const systemBalanceRef = doc(collection(db, 'transactions'));
        transaction.set(systemBalanceRef, {
          categoryId: 'system_balance',
          fromUser: sourceCategory.title,
          toUser: 'Система',
          amount: amount, // Положительная сумма для системного баланса
          description: `Системная транзакция: ${description}`,
          type: 'income',
          date: serverTimestamp()
        });
      }

      // Обновляем баланс источника (клиента)
      const newSourceBalance = sourceBalance - amount;
      transaction.update(sourceRef, {
        amount: formatAmount(newSourceBalance),
        updatedAt: serverTimestamp()
      });

      // Обновляем баланс получателя
      const newTargetBalance = targetBalance + amount;
      transaction.update(targetRef, {
        amount: formatAmount(newTargetBalance),
        updatedAt: serverTimestamp()
      });
    });
  } catch (error) {
    console.error('Ошибка при выполнении транзакции:', error);
    throw error;
  }
};