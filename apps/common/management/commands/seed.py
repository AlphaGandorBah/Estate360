"""Seed the database with demo data for development."""
import random

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.listings.models import (
    Currency,
    Listing,
    ListingStatus,
    LocationArea,
    PropertyType,
)

User = get_user_model()

LOCATIONS = list(LocationArea.values)
PROP_TYPES = list(PropertyType.values)


class Command(BaseCommand):
    help = "Populate demo data: users, landlords, agents, tenants, and listings."

    def handle(self, *args, **options):
        self.stdout.write("Seeding database …")

        # Admin
        admin, _ = User.objects.get_or_create(
            email="admin@estate360.local",
            defaults={"full_name": "Admin", "role": "admin", "is_staff": True, "is_superuser": True, "is_verified": True},
        )
        admin.set_password("Admin@123")
        admin.save()

        # Landlords
        landlords = []
        for i in range(3):
            u, created = User.objects.get_or_create(
                email=f"landlord{i+1}@example.com",
                defaults={
                    "full_name": f"Landlord {i+1}",
                    "role": "landlord",
                    "is_verified": True,
                },
            )
            if created:
                u.set_password("Password@123")
                u.save()
            landlords.append(u)

        # Rental agents manage listings on behalf of landlords and receive
        # tenant enquiries as the listing contact.
        agents = []
        for i in range(2):
            u, created = User.objects.get_or_create(
                email=f"agent{i+1}@example.com",
                defaults={
                    "full_name": f"Rental Agent {i+1}",
                    "role": "agent",
                    "is_verified": True,
                },
            )
            if created:
                u.set_password("Password@123")
                u.save()
            agents.append(u)

        property_providers = landlords + agents

        # Tenants
        tenants = []
        for i in range(5):
            u, created = User.objects.get_or_create(
                email=f"tenant{i+1}@example.com",
                defaults={"full_name": f"Tenant {i+1}", "role": "tenant"},
            )
            if created:
                u.set_password("Password@123")
                u.save()
            tenants.append(u)

        # Listings
        titles = [
            "Spacious 2-bedroom apartment with sea view",
            "Modern studio in the heart of Aberdeen",
            "Family house with garden in Lumley",
            "Affordable room near Brookfields",
            "Executive 3-bedroom apartment in Hill Station",
            "Cozy studio in Goderich",
            "3-bedroom house in Wilberforce",
            "Commercial space in Murray Town",
            "Bright 1-bedroom in Kissy",
            "Luxury 4-bedroom in Calaba Town",
        ]

        for i, title in enumerate(titles):
            provider = property_providers[i % len(property_providers)]
            Listing.objects.get_or_create(
                title=title,
                owner=provider,
                defaults={
                    "description": f"Beautiful property in Freetown. {title}. Available immediately.",
                    "property_type": random.choice(PROP_TYPES),
                    "bedrooms": random.randint(0, 4),
                    "bathrooms": random.randint(1, 3),
                    "price_annual": random.randint(5_000_000, 50_000_000),
                    "currency": Currency.SLE,
                    "location_area": LOCATIONS[i % len(LOCATIONS)],
                    "status": ListingStatus.APPROVED,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"Seed complete — {User.objects.count()} users, {Listing.objects.count()} listings."
        ))
