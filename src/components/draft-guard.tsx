import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { Button } from './ui/button';
export function useDraftGuard(onClose: () => void, busy: boolean) {
  const [dirty, setDirty] = useState(false),
    [confirm, setConfirm] = useState(false);
  return {
    markDirty: () => setDirty(true),
    requestClose: () => {
      if (!busy) {
        if (dirty) setConfirm(true);
        else onClose();
      }
    },
    confirmation: (
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Değişiklikler kaydedilmedi</AlertDialogTitle>
            <AlertDialogDescription>
              Formu kapatırsanız girdiğiniz bilgiler kaybolacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Düzenlemeye devam et</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={onClose}>
              Değişiklikleri bırak
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
