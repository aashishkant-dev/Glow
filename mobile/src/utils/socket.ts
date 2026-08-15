import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../api/client';

let socket: Socket | null = null;

// Rooms we must (re)join on EVERY connect. socket.io rooms do not survive a
// reconnect (network blip / app backgrounded), so without this the user stops
// receiving notifications after the first drop. We remember what to join and
// re-emit on the 'connect' event.
let joinedUserId: string | null = null;
const joinedBookings = new Set<string>();
const joinedInquiries = new Set<string>();

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => {
      if (joinedUserId) socket!.emit('join-user', { userId: joinedUserId });
      joinedBookings.forEach(id => socket!.emit('join-booking', { bookingId: id }));
      joinedInquiries.forEach(id => socket!.emit('join-inquiry', { otherUserId: id }));
    });
  }
  return socket;
}

export function connectSocket(token: string) {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function joinBookingRoom(bookingId: string) {
  joinedBookings.add(bookingId);
  const s = getSocket();
  if (s.connected) s.emit('join-booking', { bookingId });
}

export function sendSocketMessage(bookingId: string, text: string, senderName: string, senderRole: string) {
  getSocket().emit('send-message', { bookingId, text, senderName, senderRole });
}

export function emitTyping(bookingId: string, senderName: string, isTyping: boolean) {
  getSocket().emit('typing', { bookingId, senderName, isTyping });
}

export function joinInquiryRoom(otherUserId: string) {
  joinedInquiries.add(otherUserId);
  const s = getSocket();
  if (s.connected) s.emit('join-inquiry', { otherUserId });
}

export function sendInquirySocketMessage(otherUserId: string, text: string) {
  getSocket().emit('send-inquiry-message', { otherUserId, text });
}

export function joinUserRoom(userId: string) {
  joinedUserId = userId;
  const s = getSocket();
  if (s.connected) s.emit('join-user', { userId });
  // If not yet connected, the 'connect' handler in getSocket() will join.
}
