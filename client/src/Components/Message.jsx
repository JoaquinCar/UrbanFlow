import React, { useState } from 'react';
import { HiCalendarDays } from 'react-icons/hi2';
import '../screens/main.css';

const NOTIFICATIONS = [
  {
    id: 1,
    title: 'Appointment Success',
    description: 'You have successfully booked your appointment with Dr. Emily Walker.',
    time: '1h',
    type: 'success',
  },
  {
    id: 2,
    title: 'Appointment Cancelled',
    description: 'You have successfully cancelled your appointment with Dr. David Patel.',
    time: '2h',
    type: 'cancelled',
  },
  {
    id: 3,
    title: 'Apagón programado',
    description: 'You have successfully booked your appointment with Dr. Emily Walker.',
    time: '3h',
    type: 'alert',
  },
  {
    id: 4,
    title: 'Acerca de los proximos pagos',
    description: 'You have successfully booked your appointment with Dr. Emily Walker.',
    time: '2h',
    type: 'inform',
  },
];

export function Message() {
  return (

    <section>
        <h3 className="section-title">Notificaciones</h3>
        <div className="notifications-list">
        {NOTIFICATIONS.map((notif) => (
            <div key={notif.id} className="notification-item">
            <div className={`notification-icon notification-icon--${notif.type}`}>
                <HiCalendarDays size={22} />
            </div>
            <div className="notification-body">
                <div className="notification-meta">
                <p className="notification-title">{notif.title}</p>
                <span className="notification-time">{notif.time}</span>
                </div>
                <p className="notification-desc">{notif.description}</p>
            </div>
            </div>
        ))}
        </div>
    </section>
    

  );
}
