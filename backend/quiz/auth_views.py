from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Participant, Score

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        full_name = request.data.get("full_name", "").strip()

        if not username or not password:
            return Response({"error": "Username and password are required"}, status=status.HTTP_400_BAD_REQUEST)
        
        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken. Please choose another."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, password=password)
        if full_name:
            user.first_name = full_name
            user.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.username, "full_name": user.first_name or user.username})

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(username=username, password=password)
        
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({"token": token.key, "username": user.username, "full_name": user.first_name or user.username})
        return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_200_OK)

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "username": request.user.username,
            "full_name": request.user.first_name or request.user.username,
            "id": request.user.id
        })

class LinkProgressView(APIView):
    """
    Called after a quick quiz if the user decides to sign up/login.
    Links their anonymous session_token to their new account.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session_token = request.data.get("session_token")
        if not session_token:
            return Response({"error": "No session token provided"}, status=status.HTTP_400_BAD_REQUEST)

        participants = Participant.objects.filter(session_token=session_token)
        for p in participants:
            p.user = request.user
            p.save()
            Score.objects.filter(participant=p).update(user=request.user)

        return Response({"status": "linked", "count": participants.count()})
