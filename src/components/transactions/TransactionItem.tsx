import React from 'react';
import { ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { Transaction } from '../../types/transaction';
import { formatAmount } from '../../utils/formatUtils';
import { formatTime } from '../../utils/dateUtils';
import { useSwipeable } from 'react-swipeable';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { showErrorNotification } from '../../utils/notifications';

interface TransactionItemProps {
  transaction: Transaction;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction }) => {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handlers = useSwipeable({
    onSwipedLeft: () => setIsDeleting(true),
    onSwipedRight: () => setIsDeleting(false),
    trackMouse: true,
    preventDefaultTouchmoveEvent: true,
    delta: 10
  });

  const handleDelete = async () => {
    if (window.confirm('Вы уверены, что хотите удалить эту операцию?')) {
      try {
        await runTransaction(db, async (dbTransaction) => {
          // Получаем документ категории
          const categoryRef = doc(db, 'categories', transaction.categoryId);
          const categoryDoc = await dbTransaction.get(categoryRef);

          if (!categoryDoc.exists()) {
            throw new Error('Category not found');
          }

          // Получаем текущий баланс категории
          const currentAmount = parseFloat(categoryDoc.data().amount.replace(/[^\d.-]/g, ''));

          // Вычисляем новый баланс
          // Если удаляем расход - прибавляем сумму
          // Если удаляем доход - вычитаем сумму
          const newAmount = transaction.type === 'expense' 
            ? currentAmount + Math.abs(transaction.amount)
            : currentAmount - transaction.amount;

          // Обновляем баланс категории
          dbTransaction.update(categoryRef, {
            amount: `${newAmount} ₸`
          });

          // Удаляем транзакцию
          const transactionRef = doc(db, 'transactions', transaction.id);
          dbTransaction.delete(transactionRef);
        });

        showErrorNotification('Операция успешно удалена');
      } catch (error) {
        console.error('Error deleting transaction:', error);
        showErrorNotification('Ошибка при удалении операции');
      } finally {
        setIsDeleting(false);
      }
    } else {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Кнопка удаления (под контентом) */}
      <div 
        className={`absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center transition-opacity duration-200 ${
          isDeleting ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={handleDelete}
          className="w-full h-full flex items-center justify-center"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Основной контент транзакции */}
      <div
        {...handlers}
        className={`relative bg-white transform transition-transform duration-200 ease-out ${
          isDeleting ? '-translate-x-20' : 'translate-x-0'
        }`}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="p-4">
          <div className="flex justify-between items-start">
            <div className="flex items-start space-x-3">
              {transaction.type === 'income' ? (
                <ArrowUpRight className="w-5 h-5 text-emerald-500 mt-1" />
              ) : (
                <ArrowDownRight className="w-5 h-5 text-red-500 mt-1" />
              )}
              <div>
                <div className="font-medium">{transaction.fromUser}</div>
                <div className="text-sm text-gray-600">{transaction.toUser}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatTime(transaction.date)}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className={`font-medium ${
                transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {transaction.type === 'income' ? '+' : '-'} {formatAmount(transaction.amount)}
              </div>
              {transaction.description && (
                <div className="text-sm text-gray-500 mt-1">
                  {transaction.description}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};