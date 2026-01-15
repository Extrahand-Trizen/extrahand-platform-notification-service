import { Router } from 'express';
import notificationsRouter from './notifications';

const router = Router();

router.use('/notifications', notificationsRouter);

export default router;



