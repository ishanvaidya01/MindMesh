import requests
import json
import uuid

BASE_URL = "http://localhost:8000/api"

def print_result(name, res):
    if res.ok:
        print(f"✅ {name} - OK ({res.status_code})")
        try:
            return res.json()
        except:
            return None
    else:
        print(f"❌ {name} - FAILED ({res.status_code}): {res.text}")
        return None

def test_api():
    print("--- Starting API Tests ---")
    
    # 1. Register a user
    test_username = f"test_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "password123"
    
    res = requests.post(f"{BASE_URL}/auth/register/", json={
        "username": test_username,
        "password": test_password,
        "full_name": "Test User"
    })
    print_result("Register User", res)
    
    # 2. Login
    res = requests.post(f"{BASE_URL}/auth/login/", json={
        "username": test_username,
        "password": test_password
    })
    login_data = print_result("Login User", res)
    
    if not login_data or "token" not in login_data:
        print("Cannot continue without token.")
        return
        
    token = login_data["token"]
    headers = {"Authorization": f"Token {token}"}
    
    # 3. Create a Quiz
    quiz_data = {
        "title": "Test Quiz API",
        "description": "Testing the API",
        "owner": test_username,
        "questions": [
            {
                "text": "What is 2+2?",
                "time_limit": 30,
                "options": [
                    {"text": "3", "is_correct": False},
                    {"text": "4", "is_correct": True}
                ]
            }
        ]
    }
    res = requests.post(f"{BASE_URL}/quizzes/", json=quiz_data, headers=headers)
    quiz_created = print_result("Create Quiz", res)
    
    if not quiz_created:
        print("Cannot continue without quiz.")
        return
        
    quiz_id = quiz_created["id"]
    
    # 4. Create a Room
    res = requests.post(f"{BASE_URL}/rooms/create/", json={
        "quiz": quiz_id,
        "host": "Test Host"
    }, headers=headers)
    room_data = print_result("Create Room", res)
    
    if not room_data:
        print("Cannot continue without room.")
        return
        
    room_code = room_data["code"]
    
    # 5. Join Room as Guest
    res = requests.post(f"{BASE_URL}/rooms/{room_code}/join/", json={
        "display_name": "Guest Student"
    })
    print_result("Join Room (Guest)", res)

    # 6. Fetch Quizzes List
    res = requests.get(f"{BASE_URL}/quizzes/", headers=headers)
    print_result("List Quizzes", res)

    # 7. Rooms List
    res = requests.get(f"{BASE_URL}/rooms/", headers=headers)
    print_result("List Rooms", res)

    # 8. Scores
    res = requests.get(f"{BASE_URL}/rooms/{room_code}/scores/", headers=headers)
    print_result("Room Scores", res)

    print("--- API Tests Finished ---")

if __name__ == "__main__":
    test_api()
